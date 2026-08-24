import type { DeviceSnapshot } from "@air/core"
import type { AirEvent, CapabilityWriteRequest } from "@air/protocol"
import { routes } from "@air/protocol"
import { mockCore200SPlugin } from "./mock-core200s"
import { AirRuntime } from "./runtime"

export { AirRuntime } from "./runtime"
export { mockCore200SPlugin } from "./mock-core200s"

type JsonValue = null | boolean | number | string | readonly JsonValue[] | { readonly [key: string]: JsonValue }

type CapabilityWriteValue = CapabilityWriteRequest["value"]

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type",
  "access-control-allow-methods": "GET,PUT,OPTIONS",
}

function json<T>(value: T, status = 200) {
  return Response.json(value, { status, headers: corsHeaders })
}

function eventFrame(device: DeviceSnapshot) {
  const event: AirEvent = { type: "device.state", device }
  return `data: ${JSON.stringify(event)}\n\n`
}

function eventStream(runtime: AirRuntime, request: Request) {
  const encoder = new TextEncoder()
  let unsubscribe = () => undefined

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const device of runtime.listDevices()) controller.enqueue(encoder.encode(eventFrame(device)))
      unsubscribe = runtime.subscribe((device) => {
        controller.enqueue(encoder.encode(eventFrame(device)))
      })
      request.signal.addEventListener("abort", unsubscribe, { once: true })
    },
    cancel() {
      unsubscribe()
    },
  })

  return new Response(stream, {
    headers: {
      ...corsHeaders,
      "cache-control": "no-cache",
      "content-type": "text/event-stream; charset=utf-8",
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
      if (request.method === "GET" && url.pathname === routes.events) {
        return eventStream(runtime, request)
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
