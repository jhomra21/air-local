# air-local

A local-first, vendor-neutral control plane for indoor-air devices.

The first milestone is intentionally small: one daemon, one typed protocol/client, one web app, and one terminal UI. Device drivers and discovery plug into the daemon later without coupling the clients to a particular brand or transport.

## Apps

- `apps/daemon` — local Bun daemon that owns device state and hardware access.
- `apps/web` — Solid 2 RC web UI/PWA surface.
- `apps/cli` — OpenTUI terminal client.

## Packages

- `@air/core` — domain types and capability model.
- `@air/protocol` — wire contracts shared by daemon and clients.
- `@air/client` — typed client SDK.
- `@air/server` — in-memory server/runtime used by the daemon.

## Development

```sh
bun install
bun run dev:daemon
bun run dev:web
bun run dev:cli
```

The daemon listens on `http://localhost:8787` by default. The starter ships with a mock Core 200S-shaped device so both clients can exercise the protocol before real hardware drivers land.
