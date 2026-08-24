export type DeviceId = string
export type CapabilityId = string

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
