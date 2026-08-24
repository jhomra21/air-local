import type { DeviceId, DeviceSnapshot } from "@air/core"
import type { CapabilityWriteRequest, CapabilityWriteResponse, DeviceListResponse } from "@air/protocol"
import { routes } from "@air/protocol"

export interface AirClientOptions {
  baseUrl?: string
  fetch?: typeof globalThis.fetch
}

export function createAirClient(options: AirClientOptions = {}) {
  const baseUrl = options.baseUrl ?? "http://localhost:8787"
  const request = options.fetch ?? globalThis.fetch

  return {
    async listDevices(): Promise<DeviceSnapshot[]> {
      const response = await request(`${baseUrl}${routes.devices}`)
      if (!response.ok) throw new Error(`Failed to list devices: ${response.status}`)
      // SAFETY: the daemon's GET /v1/devices contract returns a DeviceListResponse on success.
      return (await response.json() as DeviceListResponse).devices
    },

    async setCapability(deviceId: DeviceId, input: CapabilityWriteRequest): Promise<DeviceSnapshot> {
      const response = await request(`${baseUrl}${routes.capability(deviceId)}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      })
      if (!response.ok) throw new Error(`Failed to update capability: ${response.status}`)
      // SAFETY: the daemon's PUT capability contract returns a CapabilityWriteResponse on success.
      return (await response.json() as CapabilityWriteResponse).device
    },
  }
}
