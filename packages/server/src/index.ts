import type { Capability, DeviceSnapshot } from "@air/core"
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

function json(value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "content-type",
      "access-control-allow-methods": "GET,PUT,OPTIONS",
    },
  })
}

function writableValue(capability: Capability, value: unknown): boolean | number | string | undefined {
  if (!capability.writable) return undefined
  if (capability.kind === "boolean" && typeof value === "boolean") return value
  if (capability.kind === "number" && typeof value === "number") {
    if (capability.min !== undefined && value < capability.min) return undefined
    if (capability.max !== undefined && value > capability.max) return undefined
    return value
  }
  if (capability.kind === "enum" && typeof value === "string" && capability.values.includes(value)) return value
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
        const input = (await request.json()) as { capability?: string; value?: unknown }
        const capability = input.capability ? device.capabilities[input.capability] : undefined
        if (!capability) return json({ error: "capability_not_found" }, 404)
        const value = writableValue(capability, input.value)
        if (value === undefined) return json({ error: "invalid_capability_value" }, 400)
        device.capabilities[input.capability!] = { ...capability, value } as Capability
        device.revision += 1
        return json({ device })
      }

      return json({ error: "not_found" }, 404)
    },
  })
}
