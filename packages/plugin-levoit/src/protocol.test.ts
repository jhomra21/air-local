import { describe, expect, test } from "bun:test"
import { core200sTopics, encodeCore200SCommand, parseCore200SStatus } from "./protocol"

const statusFixture = JSON.stringify({
  context: { traceId: "1234", method: "statusChangeNtyV2", cid: "device-1" },
  data: {
    changedStatus: { switch1: "off" },
    unchangedStatus: {
      mode: "sleep",
      displayPower: "on",
      filterLife: 11,
      fanSpeedLevel: 2,
      childLock: false,
      nightLightMode: "off",
    },
    changeReason: "Device",
  },
})

describe("Core 200S MQTT protocol", () => {
  test("builds device topics", () => {
    expect(core200sTopics("abc")).toEqual({
      command: "mqtt/abc/v2/bypass",
      response: "mqtt/abc/v2/bypass/rsp",
      state: "mqtt/abc/v2/req",
    })
  })

  test("parses status notifications", () => {
    expect(parseCore200SStatus(statusFixture)).toEqual({
      power: false,
      fanSpeed: 2,
      mode: "sleep",
      filterLife: 11,
      childLock: false,
      display: true,
      nightLight: "off",
    })
  })

  test("encodes documented Bypass V2 commands", () => {
    expect(encodeCore200SCommand("power", true, "trace")).toContain('"method":"setSwitch"')
    expect(encodeCore200SCommand("fan.speed", 3, "trace")).toContain('"level":3')
    expect(encodeCore200SCommand("mode", "sleep", "trace")).toContain('"method":"setPurifierMode"')
    expect(encodeCore200SCommand("display", false, "trace")).toContain('"method":"setDisplay"')
    expect(encodeCore200SCommand("child.lock", true, "trace")).toContain('"method":"setChildLock"')
    expect(encodeCore200SCommand("night.light", "dim", "trace")).toContain('"method":"setNightLight"')
  })

  test("uses the current fan speed when returning to manual mode", () => {
    const command = encodeCore200SCommand("mode", "manual", "trace", 2)
    expect(command).toContain('"method":"setLevel"')
    expect(command).toContain('"level":2')
  })

  test("rejects unsupported writes", () => {
    expect(encodeCore200SCommand("filter.life", 50, "trace")).toBeUndefined()
    expect(encodeCore200SCommand("fan.speed", 9, "trace")).toBeUndefined()
    expect(encodeCore200SCommand("night.light", "bright", "trace")).toBeUndefined()
  })
})
