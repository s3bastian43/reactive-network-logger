import type { NetworkRequest, StreamingOptions } from './types';

const DEFAULT_PORT = 8089;
const DEFAULT_RECONNECT_INTERVAL = 5000;
const MAX_QUEUE_SIZE = 100;
const WS_CONNECTING = 0;
const WS_OPEN = 1;

export default class DesktopStreaming {
  private ws: WebSocket | null = null;
  private readonly options: Required<StreamingOptions>;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private isConnected = false;
  private manuallyDisconnected = false;
  private readonly messageQueue: NetworkRequest[] = [];

  constructor(options: StreamingOptions) {
    this.options = {
      host: options.host,
      port: options.port ?? DEFAULT_PORT,
      autoReconnect: options.autoReconnect ?? true,
      reconnectInterval: options.reconnectInterval ?? DEFAULT_RECONNECT_INTERVAL,
    };
  }

  connect(): void {
    const webSocketConstructor = (globalThis as { WebSocket?: typeof WebSocket })
      .WebSocket;
    if (!webSocketConstructor) {
      console.error('[ReactiveNetwork] WebSocket is not available in this runtime');
      return;
    }

    const readyState = this.ws?.readyState;
    if (readyState === WS_OPEN || readyState === WS_CONNECTING) {
      return;
    }

    this.manuallyDisconnected = false;
    const endpoint = `ws://${this.options.host}:${this.options.port}`;

    try {
      this.ws = new webSocketConstructor(endpoint);
    } catch (error) {
      console.error('[ReactiveNetwork] Failed to create WebSocket connection:', error);
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.isConnected = true;
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
      console.log('[ReactiveNetwork] Connected to desktop app');
      this.flushQueue();
    };

    this.ws.onclose = () => {
      this.isConnected = false;
      this.ws = null;
      console.log('[ReactiveNetwork] Disconnected from desktop app');
      this.scheduleReconnect();
    };

    this.ws.onerror = (error) => {
      console.error('[ReactiveNetwork] WebSocket error:', error);
    };
  }

  sendRequest(request: NetworkRequest): void {
    if (this.isConnected && this.ws?.readyState === WS_OPEN) {
      try {
        this.ws.send(JSON.stringify(request));
        return;
      } catch (error) {
        console.error('[ReactiveNetwork] Failed to send request:', error);
      }
    }

    this.queueMessage(request);
  }

  disconnect(): void {
    this.manuallyDisconnected = true;
    this.isConnected = false;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (!this.ws) {
      return;
    }

    try {
      this.ws.close();
    } catch (error) {
      console.error('[ReactiveNetwork] Failed to close WebSocket:', error);
    } finally {
      this.ws = null;
    }
  }

  private queueMessage(request: NetworkRequest): void {
    if (this.messageQueue.length >= MAX_QUEUE_SIZE) {
      this.messageQueue.shift();
    }
    this.messageQueue.push(request);
  }

  private flushQueue(): void {
    if (!this.ws || this.ws.readyState !== WS_OPEN) {
      return;
    }

    while (this.messageQueue.length > 0 && this.ws.readyState === WS_OPEN) {
      const nextMessage = this.messageQueue.shift();
      if (!nextMessage) {
        continue;
      }

      try {
        this.ws.send(JSON.stringify(nextMessage));
      } catch (error) {
        console.error('[ReactiveNetwork] Failed to flush queued request:', error);
        this.queueMessage(nextMessage);
        break;
      }
    }
  }

  private scheduleReconnect(): void {
    if (
      this.manuallyDisconnected ||
      !this.options.autoReconnect ||
      this.reconnectTimer
    ) {
      return;
    }

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.manuallyDisconnected) {
        return;
      }

      console.log('[ReactiveNetwork] Attempting to reconnect...');
      this.connect();
    }, this.options.reconnectInterval);
  }
}
