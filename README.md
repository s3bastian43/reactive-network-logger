# @reactive-network/logger

Real-time network request monitoring for React Native apps with desktop streaming.

This package intercepts `fetch` and `XMLHttpRequest` calls, then streams request and response data to the Reactive Network desktop app over WebSocket.

## Installation

```bash
npm install @reactive-network/logger
```

or

```bash
yarn add @reactive-network/logger
```

## Quick Start

```ts
import { useEffect } from 'react';
import { startNetworkLogging, stopNetworkLogging } from '@reactive-network/logger';

export default function App() {
  useEffect(() => {
    if (__DEV__) {
      startNetworkLogging({
        desktopHost: '192.168.1.100',
        desktopPort: 8089,
      });
    }

    return () => {
      stopNetworkLogging();
    };
  }, []);

  return <YourApp />;
}
```

## API

```ts
startNetworkLogging(options?: {
  desktopHost?: string;
  desktopPort?: number;
  autoReconnect?: boolean; // default true
  reconnectInterval?: number; // default 5000ms
}): void;

stopNetworkLogging(): void;

connectToDesktop(host: string, port?: number): void;

disconnectFromDesktop(): void;
```

## Message Contract

The package emits full request objects to the desktop app:

```ts
interface NetworkRequest {
  id: string;
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | null;
  timestamp: number;
  status?: number;
  responseHeaders?: Record<string, string>;
  responseBody?: string;
  duration?: number;
  error?: string;
}
```

For each request:
1. Initial object is sent immediately (pending request).
2. Full object is sent again on response (same `id`).
3. Full object is sent on failure with `error` and `duration`.

## Reliability Guarantees

- Transparent interception (network calls continue normally)
- WebSocket auto-reconnect every 5s by default
- Offline queue up to 100 messages (FIFO, oldest dropped)
- Body truncation at 10MB (`[Content truncated]`)
- Binary payload placeholders (`[Binary data]` / `[Binary data: <content-type>]`)
- Circular reference-safe serialization (`[Circular reference detected]`)
- App backgrounding support (pauses callbacks in background, resumes on active)

## Troubleshooting

### No requests in desktop app

- Confirm desktop app is open before launching mobile app
- Verify `desktopHost` points to your computer's local IP
- Ensure phone/emulator and desktop are on the same network
- Allow incoming traffic for port `8089` in your firewall

### Requests are intercepted but not streamed

- Call `connectToDesktop(host, port)` manually after app startup
- Check logs for `[ReactiveNetwork]` connection errors
- Ensure WebSocket server is listening on `0.0.0.0:8089`

## Example App

The `example/` app demonstrates:

- automatic desktop connection
- manual connect/disconnect
- `fetch` GET/POST requests
- `XMLHttpRequest` request
- concurrent request burst

Run it with:

```bash
yarn bootstrap
yarn example start
```

## License

MIT. Forked from `react-native-network-logger` by Alex Brazier.
