import { createSignal, For, onMount } from "solid-js"
import { render } from "@solidjs/web"
import { createAirClient } from "@air/client"
import type { DeviceSnapshot } from "@air/core"
import "./style.css"

const client = createAirClient({ baseUrl: import.meta.env.VITE_AIR_URL ?? "http://localhost:8787" })

function App() {
  const [devices, setDevices] = createSignal<DeviceSnapshot[]>([])
  const [error, setError] = createSignal<string>()

  async function refresh() {
    try { setDevices(await client.listDevices()); setError(undefined) }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) }
  }

  async function togglePower(device: DeviceSnapshot) {
    const power = device.capabilities.power
    if (!power || power.kind !== "boolean") return
    await client.setCapability(device.id, { capability: "power", value: !power.value })
    await refresh()
  }

  onMount(refresh)

  return <main>
    <header><div><p class="eyebrow">LOCAL AIR</p><h1>Devices</h1></div><button onClick={refresh}>Refresh</button></header>
    {error() && <p class="error">{error()}</p>}
    <section class="grid">
      <For each={devices()}>{device => <article>
        <div class="title"><div><h2>{device.info.name}</h2><p>{device.info.manufacturer} {device.info.model}</p></div><span>{device.online ? "Online" : "Offline"}</span></div>
        <div class="capabilities">
          <For each={Object.entries(device.capabilities)}>{([id, capability]) => <div class="row"><span>{id}</span><strong>{String(capability.value)}{capability.kind === "number" ? capability.unit ?? "" : ""}</strong></div>}</For>
        </div>
        {device.capabilities.power?.kind === "boolean" && <button class="primary" onClick={() => togglePower(device)}>{device.capabilities.power.value ? "Turn off" : "Turn on"}</button>}
      </article>}</For>
    </section>
  </main>
}

render(() => <App />, document.getElementById("app")!)
