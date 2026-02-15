export type Headers = Record<string, string>;

export type RequestMethod =
  | 'GET'
  | 'POST'
  | 'PUT'
  | 'PATCH'
  | 'DELETE'
  | 'HEAD'
  | 'OPTIONS'
  | 'TRACE'
  | 'CONNECT'
  | (string & {});

export interface NetworkRequest {
  id: string;
  url: string;
  method: string;
  headers: Headers;
  body: string | null;
  timestamp: number;
  status?: number;
  responseHeaders?: Headers;
  responseBody?: string;
  duration?: number;
  error?: string;
}

export interface StreamingOptions {
  host: string;
  port?: number;
  autoReconnect?: boolean;
  reconnectInterval?: number;
}

export interface StartNetworkLoggingOptions {
  desktopHost?: string;
  desktopPort?: number;
  autoReconnect?: boolean;
  reconnectInterval?: number;

  /**
   * Legacy options kept for compatibility with the original package.
   */
  maxRequests?: number;
  ignoredHosts?: string[];
  ignoredUrls?: string[];
  ignoredPatterns?: RegExp[];
  forceEnable?: boolean;
  refreshRate?: number;
}

export type NetworkRequestCallback = (request: NetworkRequest) => void;

export type NetworkRequestInfoRow = {
  url: string;
  gqlOperation?: string;
  id: string;
  method: RequestMethod;
  status: number;
  duration: number;
  startTime: number;
};

export type DeepPartial<T> = {
  [P in keyof T]?: DeepPartial<T[P]>;
};
