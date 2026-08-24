# air-local

A local-first, vendor-neutral control plane for indoor-air devices.

The project currently provides a Bun daemon, a typed protocol/client, a Solid 2 web app, an OpenTUI terminal UI, a vendor-neutral plugin runtime, and the first real hardware integration for the Levoit Core 200S over local MQTT.

## Apps

- `apps/daemon` — local Bun daemon that owns device state and hardware access.
- `apps/web` — Solid 2 RC web UI/PWA surface.
- `apps/cli` — OpenTUI terminal client.

## Packages

- `@air/core` — domain types, capabilities, discovery, drivers, and plugin contracts.
- `@air/protocol` — wire contracts shared by daemon and clients.
- `@air/client` — typed client SDK.
- `@air/server` — plugin/device runtime and HTTP server.
- `@air/plugin-levoit` — Core 200S MQTT protocol and driver.
- `@air/transport-mqtt` — reusable MQTT.js transport adapter.

## Development

```sh
bun install
bun run dev:daemon
bun run dev:web
bun run dev:cli
```

The daemon listens on `http://localhost:8787` by default. With no hardware configuration it boots the mock Core 200S device so the web and CLI surfaces remain usable during development.

## Local Core 200S

The real Core 200S integration expects the purifier to reach a local MQTT broker using the `mqtt/<device-id>/v2/` topics. Configure the daemon with:

```sh
AIR_LEVOIT_CORE200S_ID="your-device-id" \
AIR_MQTT_URL="mqtts://your-broker:1883" \
bun run dev:daemon
```

MQTT certificate verification is enabled by default. If your isolated local broker deliberately uses a self-signed certificate, it can be disabled explicitly for development/local-network use:

```sh
AIR_MQTT_REJECT_UNAUTHORIZED=false
```

Optional broker credentials are supported through `AIR_MQTT_USERNAME` and `AIR_MQTT_PASSWORD`. Anonymous access remains possible by leaving both unset.

The daemon requires `AIR_LEVOIT_CORE200S_ID` and `AIR_MQTT_URL` together; partial hardware configuration fails at startup instead of silently falling back to the mock device.
