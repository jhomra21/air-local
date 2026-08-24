import type {
  AirPlugin,
  CapabilityId,
  CapabilityValue,
  DeviceConnection,
  DeviceSnapshot,
  DiscoveryCandidate,
  Driver,
} from "@air/core"
import { definePlugin } from "@air/core"

export interface Core200SMqttChannel {
  initialStatus: string
  publish(topic: string, payload: string): Promise<void>
  subscribe(topic: string, listener: (payload: string) => void): () => void
  close(): Promise<void>
}

export interface Core200SMqttTransport {
  connect(deviceId: string): Promise<Core200SMqttChannel>
}

export interface Core200SMqttPluginOptions {
  deviceId: string
  broker: string
  name?: string
  transport: Core200SMqttTransport
}

interface Core200SStatus {
  power: boolean
  mode: string
  display: boolean
  filterLife: number
  fanSpeed: number
  childLock: boolean
  nightLight: string
}

type JsonValue = null | boolean | number | string | readonly JsonValue[] | { readonly [key: string]: JsonValue }

function property(value: JsonValue, key: string): JsonValue | undefined {
  if (!(value instanceof Object)) return undefined
  return Object.getOwnPropertyDescriptor(value, key)?.value
}

function isStringValue(value: JsonValue | undefined): value is string {
  if (value === undefined) return false
  try {
    return String.prototype.valueOf.call(value) === value
  } catch {
    return false
  }
}

function isBooleanValue(value: JsonValue | undefined): value is boolean {
  return value === true || value === false
}

function isFiniteNumber(value: JsonValue | undefined): value is number {
  return value !== undefined && Number.isFinite(value)
}

function statusValue(changed: JsonValue | undefined, unchanged: JsonValue | undefined, key: string) {
  return property(changed ?? null, key) ?? property(unchanged ?? null, key)
}

export function parseCore200SStatus(payload: string): Core200SStatus | undefined {
  let root: JsonValue
  try {
    root = JSON.parse(payload)
  } catch {
    return undefined
  }

  const data = property(root, "data")
  const changed = property(data ?? null, "changedStatus")
  const unchanged = property(data ?? null, "unchangedStatus")

  const switch1 = statusValue(changed, unchanged, "switch1")
  const mode = statusValue(changed, unchanged, "mode")
  const displayPower = statusValue(changed, unchanged, "displayPower")
  const filterLife = statusValue(changed, unchanged, "filterLife")
  const fanSpeedLevel = statusValue(changed, unchanged, "fanSpeedLevel")
  const childLock = statusValue(changed, unchanged, "childLock")
  const nightLightMode = statusValue(changed, unchanged, "nightLightMode")

  if (!isStringValue(switch1)) return undefined
  if (!isStringValue(mode)) return undefined
  if (!isStringValue(displayPower)) return undefined
  if (!isFiniteNumber(filterLife)) return undefined
  if (!isFiniteNumber(fanSpeedLevel)) return undefined
  if (!isBooleanValue(childLock)) return undefined
  if (!isStringValue(nightLightMode)) return undefined

  return {
    power: switch1 === "on",
    mode,
    display: displayPower === "on",
    filterLife,
    fanSpeed: fanSpeedLevel,
    childLock,
    nightLight: nightLightMode,
  }
}

export function core200STopics(deviceId: string) {
  const prefix = `mqtt/${deviceId}/v2`
  return {
    command: `${prefix}/bypass`,
    response: `${prefix}/bypass/rsp`,
    status: `${prefix}/req`,
  } as const
}

function bypass(traceId: string, method: string, data: JsonValue) {
  return JSON.stringify({
    traceId,
    method: "bypassV2",
    debugMode: false,
    payload: { data, method, source: "APP" },
  })
}

export function encodeCore200SWrite(capability: CapabilityId, value: CapabilityValue, traceId: string) {
  if (capability === "fan.speed" && Number.isFinite(value)) {
    if (value < 1 || value > 3) return undefined
    return bypass(traceId, "setLevel", { id: 0, level: value, type: "wind" })
  }
  if (capability === "display" && (value === true || value === false)) {
    return bypass(traceId, "setDisplay", { state: value })
  }
  return undefined
}

function snapshotFromStatus(deviceId: string, name: string, status: Core200SStatus, revision: number): DeviceSnapshot {
  return {
    id: `levoit:${deviceId}`,
    info: { manufacturer: "Levoit", model: "Core 200S", name },
    online: true,
    revision,
    capabilities: {
      power: { kind: "boolean", value: status.power, writable: false },
      "fan.speed": { kind: "number", value: status.fanSpeed, writable: true, min: 1, max: 3, step: 1 },
      mode: { kind: "enum", value: status.mode, writable: false, values: ["manual", "sleep"] },
      "filter.life": { kind: "number", value: status.filterLife, writable: false, min: 0, max: 100, unit: "%" },
      display: { kind: "boolean", value: status.display, writable: true },
      "child.lock": { kind: "boolean", value: status.childLock, writable: false },
      "night.light": { kind: "enum", value: status.nightLight, writable: false, values: ["off", "dim", "on"] },
    },
  }
}

class Core200SConnection implements DeviceConnection {
  #snapshot: DeviceSnapshot
  #listeners = new Set<(snapshot: DeviceSnapshot) => void>()
  #unsubscribeStatus: () => void

  constructor(
    private readonly deviceId: string,
    private readonly channel: Core200SMqttChannel,
    name: string,
    status: Core200SStatus,
  ) {
    this.#snapshot = snapshotFromStatus(deviceId, name, status, 1)
    const topics = core200STopics(deviceId)
    this.#unsubscribeStatus = channel.subscribe(topics.status, (payload) => {
      const next = parseCore200SStatus(payload)
      if (!next) return
      this.#snapshot = snapshotFromStatus(deviceId, name, next, this.#snapshot.revision + 1)
      for (const listener of this.#listeners) listener(this.#snapshot)
    })
  }

  async snapshot() {
    return this.#snapshot
  }

  async write(capability: CapabilityId, value: CapabilityValue) {
    const payload = encodeCore200SWrite(capability, value, crypto.randomUUID())
    if (!payload) throw new Error(`invalid_capability_value:${capability}`)
    await this.channel.publish(core200STopics(this.deviceId).command, payload)
    return this.#snapshot
  }

  subscribe(listener: (snapshot: DeviceSnapshot) => void) {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  async close() {
    this.#unsubscribeStatus()
    await this.channel.close()
  }
}

export function createCore200SMqttPlugin(options: Core200SMqttPluginOptions): AirPlugin {
  const candidate: DiscoveryCandidate = {
    id: `levoit-core200s:${options.deviceId}`,
    source: "levoit-core200s-config",
    addresses: [{ kind: "mqtt", broker: options.broker, topic: core200STopics(options.deviceId).status }],
    metadata: { manufacturer: "Levoit", model: "Core 200S", deviceId: options.deviceId },
  }

  const driver: Driver = {
    id: "core200s-mqtt",
    match(input) {
      return input.id === candidate.id ? { confidence: 1, reason: "configured Core 200S MQTT device" } : undefined
    },
    async connect() {
      const channel = await options.transport.connect(options.deviceId)
      const status = parseCore200SStatus(channel.initialStatus)
      if (!status) {
        await channel.close()
        throw new Error(`invalid_initial_status:${options.deviceId}`)
      }
      return new Core200SConnection(options.deviceId, channel, options.name ?? "Core 200S", status)
    },
  }

  return definePlugin({
    id: `levoit-core200s:${options.deviceId}`,
    discovery: [{ id: "configured-device", async scan() { return [candidate] } }],
    drivers: [driver],
  })
}
