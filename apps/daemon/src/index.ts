import { createLevoitPlugin } from "@air/plugin-levoit"
import { AirRuntime, createAirServer } from "@air/server"
import { createMqttTransport } from "@air/transport-mqtt"

interface LevoitDaemonConfig {
  deviceId: string
  broker: string
  rejectUnauthorized: boolean
  username?: string
  password?: string
}

function env(name: string) {
  const value = Bun.env[name]?.trim()
  return value && value.length > 0 ? value : undefined
}

function rejectUnauthorized(value: string | undefined) {
  if (value === undefined || value === "true") return true
  if (value === "false") return false
  throw new Error("AIR_MQTT_REJECT_UNAUTHORIZED must be true or false")
}

function readLevoitConfig(): LevoitDaemonConfig | undefined {
  const deviceId = env("AIR_LEVOIT_CORE200S_ID")
  const broker = env("AIR_MQTT_URL")

  if (!deviceId && !broker) return undefined
  if (!deviceId || !broker) {
    throw new Error("AIR_LEVOIT_CORE200S_ID and AIR_MQTT_URL must be configured together")
  }

  return {
    deviceId,
    broker,
    rejectUnauthorized: rejectUnauthorized(env("AIR_MQTT_REJECT_UNAUTHORIZED")),
    username: env("AIR_MQTT_USERNAME"),
    password: env("AIR_MQTT_PASSWORD"),
  }
}

const config = readLevoitConfig()

if (!config) {
  const server = await createAirServer()
  console.log(`aird listening on ${server.url} with mock device`)
} else {
  const transport = await createMqttTransport({
    broker: config.broker,
    rejectUnauthorized: config.rejectUnauthorized,
    username: config.username,
    password: config.password,
  })
  const runtime = new AirRuntime()
  runtime.register(
    createLevoitPlugin({
      core200s: [
        {
          deviceId: config.deviceId,
          transport,
        },
      ],
    }),
  )
  await runtime.discoverAndConnect()

  const server = await createAirServer({ runtime, includeMockDevice: false })
  console.log(`aird listening on ${server.url} with Levoit Core 200S ${config.deviceId}`)
}
