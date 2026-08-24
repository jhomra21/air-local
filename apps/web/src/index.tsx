import { createSignal, For, onSettled, Show } from "solid-js"
import { render } from "@solidjs/web"
import { createAirClient } from "@air/client"
import type { Capability, CapabilityValue, DeviceSnapshot } from "@air/core"
import "./style.css"

const client = createAirClient({ baseUrl: import.meta.env.VITE_AIR_URL ?? "http://localhost:8787" })

function App() {
  const [devices, setDevices] = createSignal<DeviceSnapshot[]>([])
  const [error, setError] = createSignal<string>()
  const [pending, setPending] = createSignal<string>()

  function upsert(device: DeviceSnapshot) {
    setDevices((current) => {
      const index = current.findIndex((candidate) => candidate.id === device.id)
      if (index < 0) return [...current, device]
      const next = current.slice()
      next[index] = device
      return next
    })
  }

  async function refresh() {
    try {
      setDevices(await client.listDevices())
      setError(undefined)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  async function write(device: DeviceSnapshot, capability: string, value: CapabilityValue) {
    const key = `${device.id}:${capability}`
    setPending(key)
    try {
      upsert(await client.setCapability(device.id, { capability, value }))
      setError(undefined)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setPending(undefined)
    }
  }

  function valueText(capability: Capability) {
    return `${String(capability.value)}${capability.kind === "number" ? capability.unit ?? "" : ""}`
  }

  function numericChoices(capability: Capability) {
    if (
      capability.kind !== "number" ||
      capability.min === undefined ||
      capability.max === undefined ||
      !Number.isInteger(capability.min) ||
      !Number.isInteger(capability.max) ||
      capability.max - capability.min > 8
    ) return []

    const step = capability.step ?? 1
    if (!Number.isInteger(step) || step < 1) return []
    const values: number[] = []
    for (let value = capability.min; value <= capability.max; value += step) values.push(value)
    return values
  }

  function CapabilityControl(props: { device: DeviceSnapshot; id: string; capability: Capability }) {
    const key = () => `${props.device.id}:${props.id}`
    const disabled = () => pending() === key()

    return <div class="capability">
      <div class="row">
        <span>{props.id}</span>
        <strong>{valueText(props.capability)}</strong>
      </div>
      <Show when={props.capability.writable}>
        <div class="controls">
          <Show when={props.capability.kind === "boolean"}>
            <button disabled={disabled()} onClick={() => void write(props.device, props.id, !props.capability.value)}>
              {props.capability.value ? "Turn off" : "Turn on"}
            </button>
          </Show>
          <Show when={props.capability.kind === "enum"}>
            <For each={props.capability.kind === "enum" ? props.capability.values : []}>{value =>
              <button
                classList={{ selected: props.capability.value === value }}
                disabled={disabled()}
                onClick={() => void write(props.device, props.id, value)}
              >{value}</button>
            }</For>
          </Show>
          <Show when={props.capability.kind === "number" && numericChoices(props.capability).length > 0}>
            <For each={numericChoices(props.capability)}>{value =>
              <button
                classList={{ selected: props.capability.value === value }}
                disabled={disabled()}
                onClick={() => void write(props.device, props.id, value)}
              >{value}</button>
            }</For>
          </Show>
        </div>
      </Show>
    </div>
  }

  async function watch(signal: AbortSignal) {
    try {
      for await (const event of client.events(signal)) upsert(event.device)
    } catch (cause) {
      if (!signal.aborted) setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  onSettled(() => {
    const controller = new AbortController()
    void refresh()
    void watch(controller.signal)
    return () => controller.abort()
  })

  return <main>
    <header>
      <div><p class="eyebrow">LOCAL AIR</p><h1>Devices</h1></div>
      <button onClick={() => void refresh()}>Refresh</button>
    </header>
    <Show when={error()}>{message => <p class="error">{message()}</p>}</Show>
    <section class="grid">
      <For keyed each={devices()}>{device => <article>
        <div class="title">
          <div><h2>{device.info.name}</h2><p>{device.info.manufacturer} {device.info.model}</p></div>
          <span>{device.online ? "Online" : "Offline"}</span>
        </div>
        <div class="capabilities">
          <For each={Object.entries(device.capabilities)}>{([id, capability]) =>
            <CapabilityControl device={device} id={id} capability={capability} />
          }</For>
        </div>
      </article>}</For>
    </section>
  </main>
}

const root = document.getElementById("app")
if (!root) throw new Error("Missing #app mount element")
render(() => <App />, root)
