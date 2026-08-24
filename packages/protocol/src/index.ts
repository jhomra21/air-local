import type { CapabilityId, DeviceId, DeviceSnapshot } from "@air/core"

export interface DeviceListResponse {
  devices: DeviceSnapshot[]
}

export interface CapabilityWriteRequest {
  capability: CapabilityId
  value: boolean | number | string
}

export interface CapabilityWriteResponse {
  device: DeviceSnapshot
}

export type AirEvent = {
  type: "device.state"
  device: DeviceSnapshot
}

export const routes = {
  devices: "/v1/devices",
  device: (id: DeviceId) => `/v1/devices/${encodeURIComponent(id)}`,
  capability: (id: DeviceId) => `/v1/devices/${encodeURIComponent(id)}/capabilities`,
  events: "/v1/events",
} as const
