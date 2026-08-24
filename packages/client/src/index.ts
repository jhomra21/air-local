import type { DeviceId, DeviceSnapshot } from "@air/core"
import type { AirEvent, CapabilityWriteRequest, CapabilityWriteResponse, DeviceListResponse } from "@air/protocol"
import { routes } from "@air/protocol"

export interface AirClientOptions {
  baseUrl?: string
  fetch?: typeof globalThis.fetch
}

function parseEventFrame(frame: string): AirEvent | undefined {
  const line = frame
    .split("\n")
    .find((candidate) => candidate.startsWith("data: "))
  if (!line) return undefined

  try {
    // SAFETY: `/v1/events` is emitted by our daemon from the shared AirEvent contract.
    return JSON.parse(line.slice(6)) as AirEvent
  } catch {
    return undefined
  }
}

async function* readEvents(response: Response): AsyncGenerator<AirEvent> {
  if (!response.body) throw new Error("Event stream has no response body")

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""

  try {
    while (true) {
      const result = await reader.read()
      if (result.done) break
      buffer += decoder.decode(result.value, { stream: true })

      let boundary = buffer.indexOf("\n\n")
      while (boundary >= 0) {
        const frame = buffer.slice(0, boundary)
        buffer = buffer.slice(boundary + 2)
        const event = parseEventFrame(frame)
        if (event) yield event
        boundary = buffer.indexOf("\n\n")
      }
    }

    buffer += decoder.decode()
    if (buffer.length > 0) {
      const event = parseEventFrame(buffer)
      if (event) yield event
    }
  } finally {
    reader.releaseLock()
  }
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

    async *events(signal?: AbortSignal): AsyncGenerator<AirEvent> {
      const response = await request(`${baseUrl}${routes.events}`, {
        headers: { accept: "text/event-stream" },
        signal,
      })
      if (!response.ok) throw new Error(`Failed to subscribe to events: ${response.status}`)
      yield* readEvents(response)
    },
  }
}
