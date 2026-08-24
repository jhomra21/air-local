import { connectAsync, type IClientOptions, type MqttClient } from "mqtt"

export type MqttMessageListener = (payload: string) => void

export interface MqttTransportOptions {
  broker: string
  rejectUnauthorized?: boolean
  username?: string
  password?: string
}

export interface MqttPayload {
  toString(encoding?: BufferEncoding): string
}

export interface MqttClientPort {
  onMessage(listener: (topic: string, payload: MqttPayload) => void): void
  publish(topic: string, payload: string): Promise<void>
  subscribe(topic: string): Promise<void>
  close(): Promise<void>
}

class MqttJsClientPort implements MqttClientPort {
  constructor(private readonly client: MqttClient) {}

  onMessage(listener: (topic: string, payload: MqttPayload) => void) {
    this.client.on("message", listener)
  }

  async publish(topic: string, payload: string) {
    await this.client.publishAsync(topic, payload)
  }

  async subscribe(topic: string) {
    await this.client.subscribeAsync(topic, { qos: 0 })
  }

  async close() {
    await this.client.endAsync()
  }
}

export class MqttTransport {
  readonly broker: string
  #client: MqttClientPort
  #listeners = new Map<string, Set<MqttMessageListener>>()
  #subscribed = new Set<string>()

  constructor(broker: string, client: MqttClientPort) {
    this.broker = broker
    this.#client = client
    this.#client.onMessage((topic, payload) => {
      const listeners = this.#listeners.get(topic)
      if (!listeners) return
      const text = payload.toString("utf8")
      for (const listener of listeners) listener(text)
    })
  }

  async publish(topic: string, payload: string) {
    await this.#client.publish(topic, payload)
  }

  async subscribe(topic: string, listener: MqttMessageListener) {
    let listeners = this.#listeners.get(topic)
    if (!listeners) {
      listeners = new Set<MqttMessageListener>()
      this.#listeners.set(topic, listeners)
    }
    listeners.add(listener)

    if (!this.#subscribed.has(topic)) {
      await this.#client.subscribe(topic)
      this.#subscribed.add(topic)
    }

    return () => {
      listeners.delete(listener)
    }
  }

  async close() {
    this.#listeners.clear()
    this.#subscribed.clear()
    await this.#client.close()
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
  const client = await connectAsync(options.broker, clientOptions(options))
  return new MqttTransport(options.broker, new MqttJsClientPort(client))
}
