import type { CapabilityId, CapabilityValue } from "@air/core"

type JsonValue = null | boolean | number | string | readonly JsonValue[] | { readonly [key: string]: JsonValue }
type CommandData = Readonly<Record<string, boolean | number | string>>

export interface Core200SStatus {
  power?: boolean
  fanSpeed?: number
  mode?: string
  filterLife?: number
  childLock?: boolean
  display?: boolean
  nightLight?: string
}

export interface Core200STopics {
  command: string
  response: string
  state: string
}

export function core200sTopics(deviceId: string): Core200STopics {
  const prefix = `mqtt/${deviceId}/v2`
  return {
    command: `${prefix}/bypass`,
    response: `${prefix}/bypass/rsp`,
    state: `${prefix}/req`,
  }
}

function property(value: JsonValue, key: string): JsonValue | undefined {
  if (!(value instanceof Object)) return undefined
  return Object.getOwnPropertyDescriptor(value, key)?.value
}

function isStringValue(value: JsonValue): value is string {
  try {
    return String.prototype.valueOf.call(value) === value
  } catch {
    return false
  }
}

function isFiniteNumber(value: JsonValue): value is number {
  return Number.isFinite(value)
}

function isBooleanValue(value: JsonValue): value is boolean {
  return value === true || value === false
}

function statusValue(root: JsonValue, key: string): JsonValue | undefined {
  const data = property(root, "data")
  const changed = property(data, "changedStatus")
  const unchanged = property(data, "unchangedStatus")
  return property(changed, key) ?? property(unchanged, key)
}

function onOff(value: JsonValue): boolean | undefined {
  if (!isStringValue(value)) return undefined
  if (value === "on") return true
  if (value === "off") return false
  return undefined
}

export function parseCore200SStatus(payload: string): Core200SStatus | undefined {
  let root: JsonValue
  try {
    root = JSON.parse(payload)
  } catch {
    return undefined
  }

  const power = onOff(statusValue(root, "switch1"))
  const display = onOff(statusValue(root, "displayPower"))
  const fanSpeed = statusValue(root, "fanSpeedLevel")
  const filterLife = statusValue(root, "filterLife")
  const mode = statusValue(root, "mode")
  const childLock = statusValue(root, "childLock")
  const nightLight = statusValue(root, "nightLightMode")

  return {
    power,
    display,
    fanSpeed: isFiniteNumber(fanSpeed) ? fanSpeed : undefined,
    filterLife: isFiniteNumber(filterLife) ? filterLife : undefined,
    mode: isStringValue(mode) ? mode : undefined,
    childLock: isBooleanValue(childLock) ? childLock : undefined,
    nightLight: isStringValue(nightLight) ? nightLight : undefined,
  }
}

function envelope(method: string, data: CommandData, traceId: string) {
  return JSON.stringify({
    traceId,
    method: "bypassV2",
    debugMode: false,
    payload: { data, method, source: "APP" },
  })
}

function booleanCapability(value: CapabilityValue): boolean | undefined {
  return value === true || value === false ? value : undefined
}

function numberCapability(value: CapabilityValue): number | undefined {
  return Number.isFinite(value) ? value : undefined
}

function stringCapability(value: CapabilityValue): string | undefined {
  try {
    return String.prototype.valueOf.call(value) === value ? value : undefined
  } catch {
    return undefined
  }
}

export function encodeCore200SCommand(
  capability: CapabilityId,
  value: CapabilityValue,
  traceId: string,
  currentFanSpeed = 1,
): string | undefined {
  if (capability === "power") {
    const enabled = booleanCapability(value)
    return enabled === undefined ? undefined : envelope("setSwitch", { enabled, id: 0 }, traceId)
  }

  if (capability === "fan.speed") {
    const level = numberCapability(value)
    if (level === undefined || !Number.isInteger(level) || level < 1 || level > 3) return undefined
    return envelope("setLevel", { id: 0, level, type: "wind" }, traceId)
  }

  if (capability === "mode") {
    const mode = stringCapability(value)
    if (mode === "sleep") return envelope("setPurifierMode", { mode }, traceId)
    if (mode === "manual") return envelope("setLevel", { id: 0, level: currentFanSpeed, type: "wind" }, traceId)
    return undefined
  }

  if (capability === "display") {
    const state = booleanCapability(value)
    return state === undefined ? undefined : envelope("setDisplay", { state }, traceId)
  }

  if (capability === "child.lock") {
    const childLock = booleanCapability(value)
    return childLock === undefined ? undefined : envelope("setChildLock", { child_lock: childLock }, traceId)
  }

  if (capability === "night.light") {
    const nightLight = stringCapability(value)
    if (nightLight !== "off" && nightLight !== "dim" && nightLight !== "on") return undefined
    return envelope("setNightLight", { night_light: nightLight }, traceId)
  }

  return undefined
}
