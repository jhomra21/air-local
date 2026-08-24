import { describe, expect, test } from "bun:test"
import { AirRuntime } from "./runtime"
import {
  core200STopics,
  createCore200SMqttPlugin,
  encodeCore200SWrite,
  parseCore200SStatus,
  type Core200SMqttChannel,
  type Core200SMqttTransport,
} from "./core200s-mqtt"

const statusPayload = JSON.stringify({
  context: { traceId: "1234", method: "statusChangeNtyV2", cid: "device-1" },
  data: {
    changedStatus: { switch1: "on" },
    unchangedStatus: {
      mode: "sleep",
      displayPower: "on",
      filterLife: 87,
      fanSpeedLevel: 2,
      childLock: false,
      nightLightMode: "dim",
    },
    changeReason: "Device",
  },
})

describe("Core 200S MQTT protocol", () => {
  test("maps documented topics", () => {
    expect(core200STopics("abc")).toEqual({
      command: "mqtt/abc/v2/bypass",
      response: "mqtt/abc/v2/bypass/rsp",
      status: "mqtt/abc/v2/req",
    })
  })

  test("parses changed and unchanged status fields", () => {
    expect(parseCore200SStatus(statusPayload)).toEqual({
      power: true,
      mode: "sleep",
      display: true,
      filterLife: 87,
      fanSpeed: 2,
      childLock: false,
      nightLight: "dim",
    })
  })

  test("encodes corroborated writes only", () => {
    expect(encodeCore200SWrite("fan.speed", 3, "trace-1")).toContain('"method":"setLevel"')
    expect(encodeCore200SWrite("display", false, "trace-2")).toContain('"method":"setDisplay"')
    expect(encodeCore200SWrite("power", true, "trace-3")).toBeUndefined()
  })
})

describe("Core 200S MQTT plugin", () => {
  test("requires a real initial status and routes writes through MQTT", async () => {
    const published: Array<{ topic: string; payload: string }> = []
    let listener: ((payload: string) => void) | undefined

    const channel: Core200SMqttChannel = {
      initialStatus: statusPayload,
      async publish(topic, payload) {
        published.push({ topic, payload })
      },
      subscribe(_topic, next) {
        listener = next
        return () => { listener = undefined }
      },
      async close() {},
    }

    const transport: Core200SMqttTransport = {
      async connect() {
        return channel
      },
    }

    const runtime = new AirRuntime()
    runtime.register(createCore200SMqttPlugin({
      deviceId: "device-1",
      broker: "mqtts://air.local:1883",
      name: "Office purifier",
      transport,
    }))

    await runtime.discoverAndConnect()
    const initial = runtime.getDevice("levoit:device-1")
    expect(initial?.info.name).toBe("Office purifier")
    expect(initial?.capabilities["filter.life"]?.value).toBe(87)

    await runtime.write("levoit:device-1", "fan.speed", 3)
    expect(published).toHaveLength(1)
    expect(published[0]?.topic).toBe("mqtt/device-1/v2/bypass")
    expect(published[0]?.payload).toContain('"level":3')

    listener?.(JSON.stringify({
      data: {
        changedStatus: { fanSpeedLevel: 3, displayPower: "off" },
        unchangedStatus: {
          switch1: "on",
          mode: "manual",
          filterLife: 86,
          childLock: true,
          nightLightMode: "off",
        },
      },
    }))

    const updated = runtime.getDevice("levoit:device-1")
    expect(updated?.revision).toBe(2)
    expect(updated?.capabilities["fan.speed"]?.value).toBe(3)
    expect(updated?.capabilities.display?.value).toBe(false)
    expect(updated?.capabilities["child.lock"]?.value).toBe(true)
  })

  test("rejects invalid initial status instead of inventing state", async () => {
    let closed = false
    const transport: Core200SMqttTransport = {
      async connect() {
        return {
          initialStatus: "{}",
          async publish() {},
          subscribe() { return () => undefined },
          async close() { closed = true },
        }
      },
    }

    const runtime = new AirRuntime()
    runtime.register(createCore200SMqttPlugin({
      deviceId: "bad",
      broker: "mqtts://air.local:1883",
      transport,
    }))

    await expect(runtime.discoverAndConnect()).rejects.toThrow("invalid_initial_status:bad")
    expect(closed).toBe(true)
    expect(runtime.listDevices()).toEqual([])
  })
})
