import {
  definePlugin,
  withCapabilityValue,
  type CapabilityId,
  type CapabilityValue,
  type DeviceConnection,
  type DeviceSnapshot,
  type DeviceStateListener,
} from "@air/core"
import { core200sTopics, encodeCore200SCommand, parseCore200SStatus, type Core200SStatus } from "./protocol"

export interface LevoitMqttTransport {
  broker: string
  publish(topic: string, payload: string): Promise<void>
  subscribe(topic: string, listener: (payload: string) => void): Promise<() => void>
}

export interface Core200SPluginOptions {
  deviceId: string
  transport: LevoitMqttTransport
  name?: string
}

function initialSnapshot(options: Core200SPluginOptions): DeviceSnapshot {
  return {
    id: `levoit:${options.deviceId}`,
    info: {
      manufacturer: "Levoit",
      model: "Core 200S",
      name: options.name ?? "Levoit Core 200S",
    },
    online: false,
    revision: 1,
    capabilities: {
      power: { kind: "boolean", value: false, writable: true },
      "fan.speed": { kind: "number", value: 1, writable: true, min: 1, max: 3, step: 1 },
      mode: { kind: "enum", value: "manual", writable: true, values: ["manual", "sleep"] },
      "filter.life": { kind: "number", value: 100, writable: false, min: 0, max: 100, unit: "%" },
      "child.lock": { kind: "boolean", value: false, writable: true },
      display: { kind: "boolean", value: true, writable: true },
      "night.light": { kind: "enum", value: "off", writable: true, values: ["off", "dim", "on"] },
    },
  }
}

class Core200SConnection implements DeviceConnection {
  #snapshot: DeviceSnapshot
  #listeners = new Set<DeviceStateListener>()
  #unsubscribe = () => undefined
  #fanSpeed = 1

  constructor(private readonly options: Core200SPluginOptions) {
    this.#snapshot = initialSnapshot(options)
  }

  async open() {
    const topics = core200sTopics(this.options.deviceId)
    this.#unsubscribe = await this.options.transport.subscribe(topics.state, (payload) => {
      const status = parseCore200SStatus(payload)
      if (status) this.#applyStatus(status)
    })
  }

  async snapshot() {
    return this.#snapshot
  }

  async write(capabilityId: CapabilityId, value: CapabilityValue) {
    const command = encodeCore200SCommand(capabilityId, value, crypto.randomUUID(), this.#fanSpeed)
    if (!command) throw new Error(`invalid_capability_value:${capabilityId}`)

    await this.options.transport.publish(core200sTopics(this.options.deviceId).command, command)

    const capability = this.#snapshot.capabilities[capabilityId]
    const updated = capability ? withCapabilityValue(capability, value) : undefined
    if (updated) {
      this.#snapshot = {
        ...this.#snapshot,
        revision: this.#snapshot.revision + 1,
        capabilities: { ...this.#snapshot.capabilities, [capabilityId]: updated },
      }
    }
    if (capabilityId === "fan.speed" && updated?.kind === "number") this.#fanSpeed = updated.value
    this.#emit()
    return this.#snapshot
  }

  subscribe(listener: DeviceStateListener) {
    this.#listeners.add(listener)
    return () => {
      this.#listeners.delete(listener)
    }
  }

  async close() {
    this.#unsubscribe()
    this.#listeners.clear()
  }

  #applyStatus(status: Core200SStatus) {
    const capabilities = { ...this.#snapshot.capabilities }

    const power = capabilities.power
    if (status.power !== undefined && power?.kind === "boolean") {
      capabilities.power = { ...power, value: status.power }
    }

    const fanSpeed = capabilities["fan.speed"]
    if (status.fanSpeed !== undefined && fanSpeed?.kind === "number") {
      this.#fanSpeed = status.fanSpeed
      capabilities["fan.speed"] = { ...fanSpeed, value: status.fanSpeed }
    }

    const mode = capabilities.mode
    if (
      status.mode !== undefined &&
      mode?.kind === "enum" &&
      (status.mode === "manual" || status.mode === "sleep")
    ) {
      capabilities.mode = { ...mode, value: status.mode }
    }

    const filterLife = capabilities["filter.life"]
    if (status.filterLife !== undefined && filterLife?.kind === "number") {
      capabilities["filter.life"] = { ...filterLife, value: status.filterLife }
    }

    const childLock = capabilities["child.lock"]
    if (status.childLock !== undefined && childLock?.kind === "boolean") {
      capabilities["child.lock"] = { ...childLock, value: status.childLock }
    }

    const display = capabilities.display
    if (status.display !== undefined && display?.kind === "boolean") {
      capabilities.display = { ...display, value: status.display }
    }

    const nightLight = capabilities["night.light"]
    if (
      status.nightLight !== undefined &&
      nightLight?.kind === "enum" &&
      (status.nightLight === "off" || status.nightLight === "dim" || status.nightLight === "on")
    ) {
      capabilities["night.light"] = { ...nightLight, value: status.nightLight }
    }

    this.#snapshot = {
      ...this.#snapshot,
      online: true,
      revision: this.#snapshot.revision + 1,
      capabilities,
    }
    this.#emit()
  }

  #emit() {
    for (const listener of this.#listeners) listener(this.#snapshot)
  }
}

export function createCore200SPlugin(options: Core200SPluginOptions) {
  const topics = core200sTopics(options.deviceId)

  return definePlugin({
    id: "levoit",
    discovery: [
      {
        id: "configured-core200s",
        async scan() {
          return [
            {
              id: `levoit-mqtt:${options.deviceId}`,
              source: "levoit-mqtt",
              addresses: [{ kind: "mqtt", broker: options.transport.broker, topicPrefix: topics.command.slice(0, -7) }],
              metadata: { manufacturer: "Levoit", model: "Core 200S", deviceId: options.deviceId },
            },
          ]
        },
      },
    ],
    drivers: [
      {
        id: "core200s-mqtt",
        match(candidate) {
          return candidate.source === "levoit-mqtt" && candidate.metadata.model === "Core 200S"
            ? { confidence: 1, reason: "configured Core 200S MQTT endpoint" }
            : undefined
        },
        async connect() {
          const connection = new Core200SConnection(options)
          await connection.open()
          return connection
        },
      },
    ],
  })
}

export { core200sTopics, encodeCore200SCommand, parseCore200SStatus } from "./protocol"
