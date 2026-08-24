import { describe, expect, test } from "bun:test"
import { createLevoitPlugin, type LevoitMqttTransport } from "./index"

class FakeTransport implements LevoitMqttTransport {
  readonly broker: string

  constructor(broker: string) {
    this.broker = broker
  }

  async publish(_topic: string, _payload: string) {}

  async subscribe(_topic: string, _listener: (payload: string) => void) {
    return () => undefined
  }
}

describe("Levoit plugin", () => {
  test("discovers and binds multiple configured Core 200S devices", async () => {
    const firstTransport = new FakeTransport("mqtts://broker-one:1883")
    const secondTransport = new FakeTransport("mqtts://broker-two:1883")
    const plugin = createLevoitPlugin({
      core200s: [
        { deviceId: "first", name: "Office", transport: firstTransport },
        { deviceId: "second", name: "Bedroom", transport: secondTransport },
      ],
    })

    const provider = plugin.discovery?.[0]
    if (!provider) throw new Error("expected Levoit discovery provider")
    const candidates = await provider.scan()
    expect(candidates.map((candidate) => candidate.id)).toEqual(["levoit-mqtt:first", "levoit-mqtt:second"])

    const drivers = plugin.drivers ?? []
    expect(drivers).toHaveLength(2)

    const firstDriver = drivers[0]
    const secondDriver = drivers[1]
    if (!firstDriver || !secondDriver) throw new Error("expected one driver per configured purifier")

    expect(await firstDriver.match(candidates[0]!)).toBeDefined()
    expect(await firstDriver.match(candidates[1]!)).toBeUndefined()
    expect(await secondDriver.match(candidates[1]!)).toBeDefined()
  })
})
