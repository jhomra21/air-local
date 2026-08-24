# Core 200S local MQTT integration

The stock Levoit Core 200S can be redirected to a local MQTT broker without replacing its firmware. This integration is intentionally split into two layers:

- `core200s-mqtt.ts` owns Levoit topics, status parsing, capability mapping, and command payloads.
- a transport owns the actual MQTT client/broker connection and supplies raw status frames to the driver.

## Device-side network requirements

Known working setups redirect `vdmpmqtt.vesync.com` to a broker on the local network and block the remaining VeSync hosts. The purifier expects MQTT on port `1883` with TLS enabled and anonymous access. A self-signed certificate has been reported to work.

The stock firmware still needs Wi-Fi provisioning. Existing local-control work performs provisioning once with the official app; replacing that provisioning step remains a separate reverse-engineering task for air-local.

## Topics

For a device id `CID`:

```text
mqtt/CID/v2/req         device status notifications
mqtt/CID/v2/bypass      commands to device
mqtt/CID/v2/bypass/rsp  command responses
```

## Current capability policy

The first driver exposes all status fields we can map confidently, but only enables writes with corroborated local MQTT payloads.

| Capability | Read | Write |
| --- | --- | --- |
| power | yes | not yet |
| fan.speed | yes | yes, levels 1-3 |
| mode | yes | not yet |
| filter.life | yes | no |
| display | yes | yes |
| child.lock | yes | not yet |
| night.light | yes | not yet |

This is deliberate. A capability becomes writable only after its exact local command has been verified from code, captured traffic, or the physical device.

## Transport contract

`Core200SMqttTransport.connect(deviceId)` must return a channel with:

1. `initialStatus`: the first complete `mqtt/CID/v2/req` frame. The driver refuses to create a device from incomplete or fabricated state.
2. `subscribe(topic, listener)`: live MQTT status delivery.
3. `publish(topic, payload)`: command publishing.
4. `close()`: connection cleanup.

This keeps MQTT implementation details out of the Levoit driver and lets us use Mosquitto, a Bun transport, or another broker/client implementation later without changing the device API.

## Next physical-device milestone

On a machine on the same LAN as the purifier:

1. identify the purifier IP/MAC and observe DNS traffic;
2. run a TLS-enabled local MQTT broker;
3. redirect only the purifier's `vdmpmqtt.vesync.com` lookup to the broker;
4. subscribe to `mqtt/#` and capture the purifier's device id and first complete status frame;
5. implement the concrete `Core200SMqttTransport` against that broker;
6. register `createCore200SMqttPlugin(...)` with `AirRuntime`;
7. verify fan-speed and display writes against the physical purifier before enabling more commands.
