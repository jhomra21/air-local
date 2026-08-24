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
       @air/core
          |
 discovery + drivers + transports (next milestone)
```

The core models devices as capability sets rather than brand-specific classes. A driver may expose only the capabilities its hardware actually supports.
