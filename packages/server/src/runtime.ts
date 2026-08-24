import type {
  AirPlugin,
  CapabilityId,
  CapabilityValue,
  DeviceConnection,
  DeviceSnapshot,
  DiscoveryCandidate,
  Driver,
} from "@air/core"

interface RegisteredDriver {
  pluginId: string
  driver: Driver
}

interface ConnectedDevice {
  connection: DeviceConnection
  snapshot: DeviceSnapshot
  unsubscribe: () => void
  pluginId: string
  driverId: string
}

export class AirRuntime {
  #plugins = new Map<string, AirPlugin>()
  #drivers: RegisteredDriver[] = []
  #devices = new Map<string, ConnectedDevice>()

  register(plugin: AirPlugin) {
    if (this.#plugins.has(plugin.id)) throw new Error(`plugin_already_registered:${plugin.id}`)
    this.#plugins.set(plugin.id, plugin)

    for (const driver of plugin.drivers ?? []) {
      if (this.#drivers.some((entry) => entry.pluginId === plugin.id && entry.driver.id === driver.id)) {
        throw new Error(`driver_already_registered:${plugin.id}/${driver.id}`)
      }
      this.#drivers.push({ pluginId: plugin.id, driver })
    }
  }

  async scan() {
    const candidates = new Map<string, DiscoveryCandidate>()

    for (const plugin of this.#plugins.values()) {
      for (const provider of plugin.discovery ?? []) {
        for (const candidate of await provider.scan()) candidates.set(candidate.id, candidate)
      }
    }

    return [...candidates.values()]
  }

  async connect(candidate: DiscoveryCandidate) {
    let best: { pluginId: string; driver: Driver; confidence: number } | undefined

    for (const entry of this.#drivers) {
      const match = await entry.driver.match(candidate)
      if (!match || match.confidence <= 0) continue
      if (!best || match.confidence > best.confidence) {
        best = { pluginId: entry.pluginId, driver: entry.driver, confidence: match.confidence }
      }
    }

    if (!best) throw new Error(`driver_not_found:${candidate.id}`)

    const connection = await best.driver.connect(candidate, {
      pluginId: best.pluginId,
      driverId: best.driver.id,
    })
    const snapshot = await connection.snapshot()
    const existing = this.#devices.get(snapshot.id)
    if (existing) await this.disconnect(snapshot.id)

    const connected: ConnectedDevice = {
      connection,
      snapshot,
      pluginId: best.pluginId,
      driverId: best.driver.id,
      unsubscribe: () => undefined,
    }
    connected.unsubscribe = connection.subscribe((next) => {
      connected.snapshot = next
    })
    this.#devices.set(snapshot.id, connected)
    return snapshot
  }

  async discoverAndConnect() {
    const connected: DeviceSnapshot[] = []
    for (const candidate of await this.scan()) connected.push(await this.connect(candidate))
    return connected
  }

  listDevices() {
    return [...this.#devices.values()].map((device) => device.snapshot)
  }

  getDevice(id: string) {
    return this.#devices.get(id)?.snapshot
  }

  getBinding(id: string) {
    const device = this.#devices.get(id)
    return device ? { pluginId: device.pluginId, driverId: device.driverId } : undefined
  }

  async write(deviceId: string, capability: CapabilityId, value: CapabilityValue) {
    const device = this.#devices.get(deviceId)
    if (!device) throw new Error(`device_not_found:${deviceId}`)
    const snapshot = await device.connection.write(capability, value)
    device.snapshot = snapshot
    return snapshot
  }

  async disconnect(deviceId: string) {
    const device = this.#devices.get(deviceId)
    if (!device) return
    device.unsubscribe()
    await device.connection.close()
    this.#devices.delete(deviceId)
  }

  async close() {
    for (const id of this.#devices.keys()) await this.disconnect(id)
  }
}
