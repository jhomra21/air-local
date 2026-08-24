import type { CapabilityWriteRequest } from "@air/protocol"
import { routes } from "@air/protocol"
import { mockCore200SPlugin } from "./mock-core200s"
import { AirRuntime } from "./runtime"

export { AirRuntime } from "./runtime"
export { mockCore200SPlugin } from "./mock-core200s"

type JsonValue = null | boolean | number | string | readonly JsonValue[] | { readonly [key: string]: JsonValue }

type CapabilityWriteValue = CapabilityWriteRequest["value"]

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

function isFiniteNumber(value: JsonValue): value is number {
  return Number.isFinite(value)
}

function isStringValue(value: JsonValue): value is string {
  try {
    return String.prototype.valueOf.call(value) === value
  } catch {
    return false
  }
}

function parseCapabilityWriteValue(value: JsonValue): CapabilityWriteValue | undefined {
  if (value === true || value === false) return value
  if (isFiniteNumber(value)) return value
  if (isStringValue(value)) return value
  return undefined
}

function parseWriteRequest(input: JsonValue): CapabilityWriteRequest | undefined {
  if (!(input instanceof Object)) return undefined
  const capability = Object.getOwnPropertyDescriptor(input, "capability")?.value
  const value = parseCapabilityWriteValue(Object.getOwnPropertyDescriptor(input, "value")?.value)
  if (!isStringValue(capability) || value === undefined) return undefined
  return { capability, value }
}

function errorStatus(error: Error) {
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
          const device = await runtime.write(deviceId, input.capability, input.value)
          return json({ device })
        } catch (error) {
          if (!(error instanceof Error)) return json({ error: "internal_error" }, 500)
          return json({ error: error.message.split(":")[0] }, errorStatus(error))
        }
      }

      return json({ error: "not_found" }, 404)
    },
  })

  return Object.assign(server, { runtime })
}
