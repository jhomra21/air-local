import { describe, expect, test } from "bun:test"
import { MqttTransport, type MqttClientPort, type MqttPayload } from "./index"

class FakeMqttClient implements MqttClientPort {
  subscriptions: string[] = []
  publishes: Array<{ topic: string; payload: string }> = []
  ended = false
  #messageListener: ((topic: string, payload: MqttPayload) => void) | undefined

  on(event: "message", listener: (topic: string, payload: MqttPayload) => void) {
    if (event === "message") this.#messageListener = listener
    return this
  }

  async publishAsync(topic: string, payload: string) {
    this.publishes.push({ topic, payload })
  }

  async subscribeAsync(topic: string, _options: { qos: 0 }) {
    this.subscriptions.push(topic)
  }

  async endAsync() {
    this.ended = true
  }

  emit(topic: string, payload: string) {
    this.#messageListener?.(topic, { toString: () => payload })
  }
}

describe("MqttTransport", () => {
  test("subscribes once and fans messages out to listeners", async () => {
    const client = new FakeMqttClient()
    const transport = new MqttTransport("mqtt://localhost:1883", client)
    const first: string[] = []
    const second: string[] = []

    const unsubscribeFirst = await transport.subscribe("air/state", (payload) => first.push(payload))
    await transport.subscribe("air/state", (payload) => second.push(payload))

    expect(client.subscriptions).toEqual(["air/state"])

    client.emit("air/state", "one")
    expect(first).toEqual(["one"])
    expect(second).toEqual(["one"])

    unsubscribeFirst()
    client.emit("air/state", "two")
    expect(first).toEqual(["one"])
    expect(second).toEqual(["one", "two"])
  })

  test("publishes through the client and closes cleanly", async () => {
    const client = new FakeMqttClient()
    const transport = new MqttTransport("mqtt://localhost:1883", client)

    await transport.publish("air/command", "payload")
    expect(client.publishes).toEqual([{ topic: "air/command", payload: "payload" }])

    await transport.close()
    expect(client.ended).toBe(true)
  })
})
