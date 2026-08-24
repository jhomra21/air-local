import type { Capability, DeviceSnapshot } from "@air/core"
import type { CapabilityWriteRequest } from "@air/protocol"
import { routes } from "@air/protocol"

const devices = new Map<string, DeviceSnapshot>([
  [
    "core200s-demo",
    {
      id: "core200s-demo",
      info: { manufacturer: "Levoit", model: "Core 200S", name: "Office purifier" },
      online: true,
      revision: 1,
      capabilities: {
        power: { kind: "boolean", value: true, writable: true },
        "fan.speed": { kind: "number", value: 1, writable: true, min: 1, max: 3, step: 1 },
        mode: { kind: "enum", value: "manual", writable: true, values: ["manual", "sleep"] },
        "filter.life": { kind: "number", value: 100, writable: false, min: 0, max: 100, unit: "%" },
        "child.lock": { kind: "boolean", value: false, writable: true },
        "night.light": { kind: "enum", value: "off", writable: true, values: ["off", "dim", "on"] },
      },
    },
  ],
])

type JsonValue = null | boolean | number | string | readonly JsonValue[] | { readonly [key: string]: JsonValue }

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

type CapabilityWriteValue = CapabilityWriteRequest["value"]

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

interface ParsedCapabilityWriteRequest {
  capability: string
  value: CapabilityWriteValue
}

function parseCapabilityWriteRequest(input: JsonValue): ParsedCapabilityWriteRequest | undefined {
  if (!(input instanceof Object)) return undefined
  const capability = Object.getOwnPropertyDescriptor(input, "capability")?.value
  const value = parseCapabilityWriteValue(Object.getOwnPropertyDescriptor(input, "value")?.value)
  if (!isStringValue(capability) || value === undefined) return undefined
  return { capability, value }
}

function updateCapability(capability: Capability, value: CapabilityWriteValue): Capability | undefined {
  if (!capability.writable) return undefined
  if (capability.kind === "boolean" && (value === true || value === false)) {
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

export function createAirServer() {
  return Bun.serve({
    port: Number(Bun.env.PORT ?? 8787),
    async fetch(request) {
      const url = new URL(request.url)
      if (request.method === "OPTIONS") return json(null, 204)
      if (request.method === "GET" && url.pathname === routes.devices) return json({ devices: [...devices.values()] })

      const match = url.pathname.match(/^\/v1\/devices\/([^/]+)\/capabilities$/)
      if (request.method === "PUT" && match) {
        const id = decodeURIComponent(match[1]!)
        const device = devices.get(id)
        if (!device) return json({ error: "device_not_found" }, 404)
        const input = parseCapabilityWriteRequest(await request.json())
        if (!input) return json({ error: "invalid_capability_request" }, 400)
        const capability = device.capabilities[input.capability]
        if (!capability) return json({ error: "capability_not_found" }, 404)
        const updatedCapability = updateCapability(capability, input.value)
        if (!updatedCapability) return json({ error: "invalid_capability_value" }, 400)
        device.capabilities[input.capability] = updatedCapability
        device.revision += 1
        return json({ device })
      }

      return json({ error: "not_found" }, 404)
    },
  })
}
