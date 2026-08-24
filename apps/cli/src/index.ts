#!/usr/bin/env bun
import { Box, Text, createCliRenderer } from "@opentui/core"
import { createAirClient } from "@air/client"

const client = createAirClient({ baseUrl: Bun.env.AIR_URL ?? "http://localhost:8787" })
const renderer = await createCliRenderer({ exitOnCtrlC: true })

const root = Box({
  borderStyle: "rounded",
  padding: 1,
  flexDirection: "column",
  gap: 1,
}, Text({ content: "air-local", fg: "cyan" }), Text({ content: "Connecting…" }))

renderer.root.add(root)

try {
  const devices = await client.listDevices()
  root.add(Text({ content: `${devices.length} device${devices.length === 1 ? "" : "s"}` }))
  for (const device of devices) {
    const summary = Object.entries(device.capabilities)
      .map(([id, capability]) => `${id}=${String(capability.value)}`)
      .join("  ")
    root.add(
      Box({ borderStyle: "rounded", padding: 1, flexDirection: "column" },
        Text({ content: device.info.name, fg: "green" }),
        Text({ content: `${device.info.manufacturer ?? "Unknown"} ${device.info.model ?? ""}`.trim() }),
        Text({ content: summary }),
      ),
    )
  }
  root.add(Text({ content: "Ctrl+C to quit", fg: "gray" }))
} catch (error) {
  root.add(Text({ content: error instanceof Error ? error.message : String(error), fg: "red" }))
}
