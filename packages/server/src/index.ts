import type { CapabilityValue } from "@air/core"
import type { CapabilityWriteRequest } from "@air/protocol"
import { routes } from "@air/protocol"
import { mockCore200SPlugin } from "./mock-core200s"
import { AirRuntime } from "./runtime"

export { AirRuntime } from "./runtime"
export { mockCore200SPlugin } from "./mock-core200s"

function json<T>(value: T, status = 200) {
  return Response.json(value, {
    status,
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "content-type",
      "access-control-allow-methods": "GET,PUT,OPTIONS",
    },
  })
}

function parseWriteRequest(input: unknown): CapabilityWriteRequest | undefined {
  if (!input || typeof input !== "object") return undefined
  const record = input as Record<string, unknown>
  const capability = record.capability
  const value = record.value
  if (typeof capability !== "string") return undefined
  if (typeof value !== "boolean" && typeof value !== "string" && typeof value !== "number") return undefined
  if (typeof value === "number" && !Number.isFinite(value)) return undefined
  return { capability, value }
}

function errorStatus(error: unknown) {
  if (!(error instanceof Error)) return 500
  if (error.message.startsWith("device_not_found:")) return 404
  if (error.message.startsWith("capability_not_found:")) return 404
  if (error.message.startsWith("invalid_capability_value:")) return 400
  return 500
}

export interface AirServerOptions {
  port?: number
  runtime?: AirRuntime
  includeMockDevice?: boolean
}

export async function createAirServer(options: AirServerOptions = {}) {
  const runtime = options.runtime ?? new AirRuntime()
  if (options.includeMockDevice ?? options.runtime === undefined) {
    runtime.register(mockCore200SPlugin)
    await runtime.discoverAndConnect()
  }

  const server = Bun.serve({
    port: options.port ?? Number(Bun.env.PORT ?? 8787),
    async fetch(request) {
      const url = new URL(request.url)
      if (request.method === "OPTIONS") return json(null, 204)
      if (request.method === "GET" && url.pathname === routes.devices) {
        return json({ devices: runtime.listDevices() })
      }

      const match = url.pathname.match(/^\/v1\/devices\/([^/]+)\/capabilities$/)
      if (request.method === "PUT" && match) {
        const deviceId = decodeURIComponent(match[1]!)
        const input = parseWriteRequest(await request.json())
        if (!input) return json({ error: "invalid_capability_request" }, 400)

        try {
          const device = await runtime.write(deviceId, input.capability, input.value as CapabilityValue)
          return json({ device })
        } catch (error) {
          return json({ error: error instanceof Error ? error.message.split(":")[0] : "internal_error" }, errorStatus(error))
        }
      }

      return json({ error: "not_found" }, 404)
    },
  })

  return Object.assign(server, { runtime })
}
