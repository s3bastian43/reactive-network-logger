import { AppState, type AppStateStatus, type NativeEventSubscription } from 'react-native';
import DesktopStreaming from './desktopStreaming';
import NetworkInterceptor from './interceptor';
import type { NetworkRequest, StartNetworkLoggingOptions } from './types';

let interceptor: NetworkInterceptor | null = null;
let streaming: DesktopStreaming | null = null;
let appStateSubscription: NativeEventSubscription | null = null;

let reconnectOptions: Pick<
  StartNetworkLoggingOptions,
  'autoReconnect' | 'reconnectInterval'
> = {};

const forwardRequestToDesktop = (request: NetworkRequest): void => {
  if (!streaming) {
    return;
  }

  try {
    streaming.sendRequest(request);
  } catch (error) {
    console.error('[ReactiveNetwork] Failed to stream request:', error);
  }
};

const ensureAppStateListener = (): void => {
  if (appStateSubscription) {
    return;
  }

  if (!AppState || typeof AppState.addEventListener !== 'function') {
    return;
  }

  const handleAppStateChange = (state: AppStateStatus): void => {
    if (!interceptor) {
      return;
    }

    if (state === 'active') {
      interceptor.resume();
      return;
    }

    interceptor.pause();
  };

  appStateSubscription = AppState.addEventListener('change', handleAppStateChange);
  handleAppStateChange(AppState.currentState ?? 'active');
};

const removeAppStateListener = (): void => {
  if (!appStateSubscription) {
    return;
  }

  appStateSubscription.remove();
  appStateSubscription = null;
};

const createStreaming = (
  host: string,
  port?: number,
  overrideOptions?: Pick<
    StartNetworkLoggingOptions,
    'autoReconnect' | 'reconnectInterval'
  >
): DesktopStreaming => {
  return new DesktopStreaming({
    host,
    port,
    autoReconnect: overrideOptions?.autoReconnect ?? reconnectOptions.autoReconnect,
    reconnectInterval:
      overrideOptions?.reconnectInterval ?? reconnectOptions.reconnectInterval,
  });
};

export function startNetworkLogging(options?: StartNetworkLoggingOptions): void {
  if (interceptor) {
    console.warn('[ReactiveNetwork] Network logging has already started');
    return;
  }

  reconnectOptions = {
    autoReconnect: options?.autoReconnect,
    reconnectInterval: options?.reconnectInterval,
  };

  interceptor = new NetworkInterceptor();
  interceptor.start(forwardRequestToDesktop);
  ensureAppStateListener();

  if (options?.desktopHost) {
    const desktopStreaming = createStreaming(
      options.desktopHost,
      options.desktopPort,
      options
    );
    streaming = desktopStreaming;
    desktopStreaming.connect();
  }

  console.log('[ReactiveNetwork] Network logging started');
}

export function connectToDesktop(host: string, port?: number): void {
  if (streaming) {
    streaming.disconnect();
  }

  const desktopStreaming = createStreaming(host, port);
  streaming = desktopStreaming;
  desktopStreaming.connect();
}

export function disconnectFromDesktop(): void {
  if (!streaming) {
    return;
  }

  streaming.disconnect();
  streaming = null;
}

export function stopNetworkLogging(): void {
  removeAppStateListener();
  disconnectFromDesktop();

  if (interceptor) {
    interceptor.stop();
    interceptor = null;
  }

  reconnectOptions = {};
  console.log('[ReactiveNetwork] Network logging stopped');
}

export type {
  Headers,
  NetworkRequest,
  NetworkRequestCallback,
  RequestMethod,
  StartNetworkLoggingOptions,
  StreamingOptions,
} from './types';
