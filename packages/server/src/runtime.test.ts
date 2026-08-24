import { describe, expect, test } from "bun:test"
import { definePlugin, type DiscoveryCandidate } from "@air/core"
import { mockCore200SPlugin } from "./mock-core200s"
import { AirRuntime } from "./runtime"

const unknownCandidate: DiscoveryCandidate = {
  id: "unknown:1",
  source: "test",
  addresses: [{ kind: "virtual", id: "unknown" }],
  metadata: {},
}

describe("AirRuntime", () => {
  test("discovers, matches, and connects a plugin device", async () => {
    const runtime = new AirRuntime()
    runtime.register(mockCore200SPlugin)

    const candidates = await runtime.scan()
    expect(candidates).toHaveLength(1)

    const device = await runtime.connect(candidates[0]!)
    expect(device.info.model).toBe("Core 200S")
    expect(runtime.getBinding(device.id)).toEqual({ pluginId: "mock-core200s", driverId: "core200s" })
    expect(runtime.listDevices()).toHaveLength(1)

    await runtime.close()
  })

  test("routes capability writes through the connected driver", async () => {
    const runtime = new AirRuntime()
    runtime.register(mockCore200SPlugin)
    await runtime.discoverAndConnect()

    const before = runtime.getDevice("core200s-demo")!
    const after = await runtime.write("core200s-demo", "fan.speed", 3)

    expect(after.revision).toBe(before.revision + 1)
    expect(after.capabilities["fan.speed"]?.value).toBe(3)
    expect(runtime.getDevice("core200s-demo")?.capabilities["fan.speed"]?.value).toBe(3)

    await runtime.close()
  })

  test("rejects invalid and read-only capability writes", async () => {
    const runtime = new AirRuntime()
    runtime.register(mockCore200SPlugin)
    await runtime.discoverAndConnect()

    await expect(runtime.write("core200s-demo", "fan.speed", 9)).rejects.toThrow("invalid_capability_value")
    await expect(runtime.write("core200s-demo", "filter.life", 50)).rejects.toThrow("invalid_capability_value")

    await runtime.close()
  })

  test("fails when no driver recognizes a candidate", async () => {
    const runtime = new AirRuntime()
    runtime.register(definePlugin({ id: "empty" }))

    await expect(runtime.connect(unknownCandidate)).rejects.toThrow("driver_not_found")
  })

  test("rejects duplicate plugin registration", () => {
    const runtime = new AirRuntime()
    runtime.register(mockCore200SPlugin)

    expect(() => runtime.register(mockCore200SPlugin)).toThrow("plugin_already_registered")
  })
})
