# Architecture

Clients never speak MQTT, BLE, Matter, or vendor protocols directly.

```text
web / cli / future clients
          |
      @air/client
          |
     @air/protocol
          |
        aird
          |
      @air/server
          |
      AirRuntime
       |     |
 discovery drivers
       |     |
       plugins
          |
 transports / hardware
```

## Core contracts

`@air/core` owns only vendor-neutral contracts and capability types.

- `DiscoveryProvider` finds transport-level candidates.
- `Driver` matches a candidate and opens a `DeviceConnection`.
- `AirPlugin` groups discovery providers and drivers under a stable namespace.
- `DeviceConnection` exposes snapshots, capability writes, state subscriptions, and shutdown.

The runtime chooses the highest-confidence matching driver. Driver IDs are namespaced by plugin ID so independent plugins can use the same local driver name without colliding.

## Capability model

Devices are capability sets rather than brand-specific classes. A driver exposes only capabilities the hardware actually supports. Capability validation lives in core so every driver follows the same boolean, number-range, and enum semantics.

## Server boundary

`@air/server` owns plugin registration, discovery, connections, state, and command routing. HTTP handlers delegate writes to the runtime and never mutate device snapshots themselves.

The included Core 200S is intentionally a mock plugin. It exercises exactly the same discovery and driver path a real Levoit, Matter, Xiaomi, or BLE plugin will use, so clients remain unaware of vendor and transport details.
