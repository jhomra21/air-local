export type DeviceId = string
export type CapabilityId = string
export type CapabilityValue = boolean | number | string

export type BooleanCapability = {
  kind: "boolean"
  value: boolean
  writable: boolean
}

export type NumberCapability = {
  kind: "number"
  value: number
  writable: boolean
  min?: number
  max?: number
  step?: number
  unit?: string
}

export type EnumCapability = {
  kind: "enum"
  value: string
  writable: boolean
  values: readonly string[]
}

export type Capability = BooleanCapability | NumberCapability | EnumCapability
export type CapabilitySet = Record<CapabilityId, Capability>

export interface DeviceInfo {
  manufacturer?: string
  model?: string
  name: string
}

export interface DeviceSnapshot {
  id: DeviceId
  info: DeviceInfo
  online: boolean
  revision: number
  capabilities: CapabilitySet
}

export type TransportAddress =
  | { kind: "ip"; host: string; port?: number }
  | { kind: "ble"; id: string }
  | { kind: "matter"; id: string }
  | { kind: "virtual"; id: string }

export interface DiscoveryCandidate {
  id: string
  source: string
  addresses: readonly TransportAddress[]
  metadata: Readonly<Record<string, string | number | boolean>>
}

export interface DriverMatch {
  confidence: number
  reason?: string
}

export type DeviceStateListener = (snapshot: DeviceSnapshot) => void

export interface DeviceConnection {
  snapshot(): Promise<DeviceSnapshot>
  write(capability: CapabilityId, value: CapabilityValue): Promise<DeviceSnapshot>
  subscribe(listener: DeviceStateListener): () => void
  close(): Promise<void>
}

export interface DriverContext {
  pluginId: string
  driverId: string
}

export interface Driver {
  id: string
  match(candidate: DiscoveryCandidate): Promise<DriverMatch | undefined> | DriverMatch | undefined
  connect(candidate: DiscoveryCandidate, context: DriverContext): Promise<DeviceConnection>
}

export interface DiscoveryProvider {
  id: string
  scan(): Promise<readonly DiscoveryCandidate[]>
}

export interface AirPlugin {
  id: string
  drivers?: readonly Driver[]
  discovery?: readonly DiscoveryProvider[]
}

export function definePlugin(plugin: AirPlugin): AirPlugin {
  return plugin
}

function isBooleanValue(value: CapabilityValue): value is boolean {
  return value === true || value === false
}

function isFiniteNumber(value: CapabilityValue): value is number {
  return Number.isFinite(value)
}

function isStringValue(value: CapabilityValue): value is string {
  try {
    return String.prototype.valueOf.call(value) === value
  } catch {
    return false
  }
}

export function withCapabilityValue(capability: Capability, value: CapabilityValue): Capability | undefined {
  if (!capability.writable) return undefined

  if (capability.kind === "boolean" && isBooleanValue(value)) {
    return { ...capability, value }
  }

  if (capability.kind === "number" && isFiniteNumber(value)) {
    if (capability.min !== undefined && value < capability.min) return undefined
    if (capability.max !== undefined && value > capability.max) return undefined
    return { ...capability, value }
  }

  if (capability.kind === "enum" && isStringValue(value) && capability.values.includes(value)) {
    return { ...capability, value }
  }

  return undefined
}
