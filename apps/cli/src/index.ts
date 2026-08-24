#!/usr/bin/env bun
import { Box, Text, createCliRenderer, type KeyEvent } from "@opentui/core"
import { createAirClient } from "@air/client"
import type { CapabilityValue, DeviceSnapshot } from "@air/core"

const client = createAirClient({ baseUrl: Bun.env.AIR_URL ?? "http://localhost:8787" })
const renderer = await createCliRenderer({ exitOnCtrlC: true })

let devices: DeviceSnapshot[] = []
let selectedIndex = 0
let statusMessage = "Connecting…"

const body = Text({ content: "" })
const status = Text({ content: statusMessage, fg: "gray" })
const root = Box(
  {
    borderStyle: "rounded",
    padding: 1,
    flexDirection: "column",
    gap: 1,
  },
  Text({ content: "air-local", fg: "cyan" }),
  Text({ content: "↑/↓ select  space power  1/2/3 fan  s sleep  m manual  l light  r refresh  Ctrl+C quit", fg: "gray" }),
  body,
  status,
)

renderer.root.add(root)

function selectedDevice() {
  return devices[selectedIndex]
}

function upsert(device: DeviceSnapshot) {
  const index = devices.findIndex((candidate) => candidate.id === device.id)
  if (index < 0) devices = [...devices, device]
  else {
    const next = devices.slice()
    next[index] = device
    devices = next
  }
  if (selectedIndex >= devices.length) selectedIndex = Math.max(0, devices.length - 1)
  renderDevices()
}

function capabilitySummary(device: DeviceSnapshot) {
  return Object.entries(device.capabilities)
    .map(([id, capability]) => {
      const unit = capability.kind === "number" ? capability.unit ?? "" : ""
      return `${id}=${String(capability.value)}${unit}`
    })
    .join("  ")
}

function renderDevices() {
  if (devices.length === 0) {
    body.content = "No devices"
    status.content = statusMessage
    return
  }

  body.content = devices
    .map((device, index) => {
      const marker = index === selectedIndex ? ">" : " "
      const connection = device.online ? "online" : "offline"
      const title = `${marker} ${device.info.name} · ${device.info.manufacturer ?? "Unknown"} ${device.info.model ?? ""} · ${connection}`
      return `${title.trimEnd()}\n  ${capabilitySummary(device)}`
    })
    .join("\n\n")
  status.content = statusMessage
}

function setStatus(message: string) {
  statusMessage = message
  status.content = message
}

async function refresh() {
  try {
    devices = await client.listDevices()
    if (selectedIndex >= devices.length) selectedIndex = Math.max(0, devices.length - 1)
    setStatus(`${devices.length} device${devices.length === 1 ? "" : "s"}`)
    renderDevices()
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error))
  }
}

async function write(capability: string, value: CapabilityValue) {
  const device = selectedDevice()
  if (!device) return
  try {
    setStatus(`Setting ${capability}…`)
    upsert(await client.setCapability(device.id, { capability, value }))
    setStatus(`Updated ${capability}`)
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error))
  }
}

async function togglePower() {
  const capability = selectedDevice()?.capabilities.power
  if (capability?.kind !== "boolean" || !capability.writable) return
  await write("power", !capability.value)
}

async function setFanSpeed(speed: number) {
  const capability = selectedDevice()?.capabilities["fan.speed"]
  if (capability?.kind !== "number" || !capability.writable) return
  await write("fan.speed", speed)
}

async function setMode(mode: string) {
  const capability = selectedDevice()?.capabilities.mode
  if (capability?.kind !== "enum" || !capability.writable || !capability.values.includes(mode)) return
  await write("mode", mode)
}

async function cycleNightLight() {
  const capability = selectedDevice()?.capabilities["night.light"]
  if (capability?.kind !== "enum" || !capability.writable) return
  const values = capability.values
  const index = values.indexOf(capability.value)
  const next = values[(index + 1) % values.length]
  if (next !== undefined) await write("night.light", next)
}

renderer.keyInput.on("keypress", (key: KeyEvent) => {
  if (key.name === "up") {
    selectedIndex = Math.max(0, selectedIndex - 1)
    renderDevices()
    return
  }
  if (key.name === "down") {
    selectedIndex = Math.min(Math.max(0, devices.length - 1), selectedIndex + 1)
    renderDevices()
    return
  }
  if (key.name === "space") void togglePower()
  else if (key.name === "1") void setFanSpeed(1)
  else if (key.name === "2") void setFanSpeed(2)
  else if (key.name === "3") void setFanSpeed(3)
  else if (key.name === "s") void setMode("sleep")
  else if (key.name === "m") void setMode("manual")
  else if (key.name === "l") void cycleNightLight()
  else if (key.name === "r") void refresh()
})

await refresh()

const controller = new AbortController()
process.once("exit", () => controller.abort())

try {
  for await (const event of client.events(controller.signal)) upsert(event.device)
} catch (error) {
  if (!controller.signal.aborted) setStatus(error instanceof Error ? error.message : String(error))
}
