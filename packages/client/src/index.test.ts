import { describe, expect, test } from "bun:test"
import { createAirClient } from "./index"

const eventPayload = {
  type: "device.state",
  device: {
    id: "core200s-demo",
    info: { manufacturer: "Levoit", model: "Core 200S", name: "Office purifier" },
    online: true,
    revision: 2,
    capabilities: {
      power: { kind: "boolean", value: true, writable: true },
    },
  },
} as const

describe("AirClient events", () => {
  test("decodes server-sent device events across chunks", async () => {
    const encoder = new TextEncoder()
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const frame = `data: ${JSON.stringify(eventPayload)}\n\n`
        controller.enqueue(encoder.encode(frame.slice(0, 17)))
        controller.enqueue(encoder.encode(frame.slice(17)))
        controller.close()
      },
    })

    const client = createAirClient({
      fetch: async () => new Response(stream, { status: 200, headers: { "content-type": "text/event-stream" } }),
    })

    const events = []
    for await (const event of client.events()) events.push(event)

    expect(events).toEqual([eventPayload])
  })

  test("ignores malformed event frames", async () => {
    const encoder = new TextEncoder()
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode("data: not-json\n\n"))
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(eventPayload)}\n\n`))
        controller.close()
      },
    })

    const client = createAirClient({ fetch: async () => new Response(stream, { status: 200 }) })
    const events = []
    for await (const event of client.events()) events.push(event)

    expect(events).toEqual([eventPayload])
  })
})
