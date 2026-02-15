import type { StartNetworkLoggingOptions } from './types';

export const startNetworkLogging = (_options?: StartNetworkLoggingOptions) => {
  console.warn('[ReactiveNetwork] startNetworkLogging is not supported on web');
};

export const stopNetworkLogging = () => {
  console.warn('[ReactiveNetwork] stopNetworkLogging is not supported on web');
};

export const connectToDesktop = (_host: string, _port?: number) => {
  console.warn('[ReactiveNetwork] connectToDesktop is not supported on web');
};

export const disconnectFromDesktop = () => {
  console.warn('[ReactiveNetwork] disconnectFromDesktop is not supported on web');
};

export default () => null;
