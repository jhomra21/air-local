import { connectAsync, type IClientOptions, type MqttClient } from "mqtt"

export type MqttMessageListener = (payload: string) => void

export interface MqttTransportOptions {
  broker: string
  rejectUnauthorized?: boolean
  username?: string
  password?: string
}

interface MqttPayload {
  toString(encoding?: BufferEncoding): string
}

interface MqttClientPort {
  on(event: "message", listener: (topic: string, payload: MqttPayload) => void): unknown
  publishAsync(topic: string, payload: string): Promise<unknown>
  subscribeAsync(topic: string, options: { qos: 0 }): Promise<unknown>
  endAsync(): Promise<void>
}

export class MqttTransport {
  readonly broker: string
  #client: MqttClientPort
  #listeners = new Map<string, Set<MqttMessageListener>>()
  #subscribed = new Set<string>()

  constructor(broker: string, client: MqttClientPort) {
    this.broker = broker
    this.#client = client
    this.#client.on("message", (topic, payload) => {
      const listeners = this.#listeners.get(topic)
      if (!listeners) return
      const text = payload.toString("utf8")
      for (const listener of listeners) listener(text)
    })
  }

  async publish(topic: string, payload: string) {
    await this.#client.publishAsync(topic, payload)
  }

  async subscribe(topic: string, listener: MqttMessageListener) {
    let listeners = this.#listeners.get(topic)
    if (!listeners) {
      listeners = new Set<MqttMessageListener>()
      this.#listeners.set(topic, listeners)
    }
    listeners.add(listener)

    if (!this.#subscribed.has(topic)) {
      await this.#client.subscribeAsync(topic, { qos: 0 })
      this.#subscribed.add(topic)
    }

    return () => {
      listeners.delete(listener)
    }
  }

  async close() {
    this.#listeners.clear()
    this.#subscribed.clear()
    await this.#client.endAsync()
  }
}

function clientOptions(options: MqttTransportOptions): IClientOptions {
  return {
    rejectUnauthorized: options.rejectUnauthorized ?? true,
    username: options.username,
    password: options.password,
  }
}

export async function createMqttTransport(options: MqttTransportOptions) {
  const client: MqttClient = await connectAsync(options.broker, clientOptions(options))
  return new MqttTransport(options.broker, client)
}
