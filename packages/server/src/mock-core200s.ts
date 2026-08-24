import {
  definePlugin,
  withCapabilityValue,
  type CapabilityId,
  type CapabilityValue,
  type DeviceConnection,
  type DeviceSnapshot,
  type DeviceStateListener,
  type DiscoveryCandidate,
} from "@air/core"

const candidate: DiscoveryCandidate = {
  id: "mock:core200s-demo",
  source: "mock",
  addresses: [{ kind: "virtual", id: "core200s-demo" }],
  metadata: {
    manufacturer: "Levoit",
    model: "Core 200S",
    mock: true,
  },
}

function createSnapshot(): DeviceSnapshot {
  return {
    id: "core200s-demo",
    info: { manufacturer: "Levoit", model: "Core 200S", name: "Office purifier" },
    online: true,
    revision: 1,
    capabilities: {
      power: { kind: "boolean", value: true, writable: true },
      "fan.speed": { kind: "number", value: 1, writable: true, min: 1, max: 3, step: 1 },
      mode: { kind: "enum", value: "manual", writable: true, values: ["manual", "sleep"] },
      "filter.life": { kind: "number", value: 100, writable: false, min: 0, max: 100, unit: "%" },
      "child.lock": { kind: "boolean", value: false, writable: true },
      "night.light": { kind: "enum", value: "off", writable: true, values: ["off", "dim", "on"] },
    },
  }
}

class MockCore200SConnection implements DeviceConnection {
  #snapshot = createSnapshot()
  #listeners = new Set<DeviceStateListener>()

  async snapshot() {
    return this.#snapshot
  }

  async write(capabilityId: CapabilityId, value: CapabilityValue) {
    const capability = this.#snapshot.capabilities[capabilityId]
    if (!capability) throw new Error(`capability_not_found:${capabilityId}`)

    const updated = withCapabilityValue(capability, value)
    if (!updated) throw new Error(`invalid_capability_value:${capabilityId}`)

    this.#snapshot = {
      ...this.#snapshot,
      revision: this.#snapshot.revision + 1,
      capabilities: { ...this.#snapshot.capabilities, [capabilityId]: updated },
    }
    for (const listener of this.#listeners) listener(this.#snapshot)
    return this.#snapshot
  }

  subscribe(listener: DeviceStateListener) {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  async close() {
    this.#listeners.clear()
  }
}

export const mockCore200SPlugin = definePlugin({
  id: "mock-core200s",
  discovery: [
    {
      id: "mock-core200s",
      async scan() {
        return [candidate]
      },
    },
  ],
  drivers: [
    {
      id: "core200s",
      match(input) {
        return input.source === "mock" && input.metadata.model === "Core 200S"
          ? { confidence: 1, reason: "mock Core 200S fixture" }
          : undefined
      },
      async connect() {
        return new MockCore200SConnection()
      },
    },
  ],
})
