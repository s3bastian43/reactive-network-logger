import type { Headers, NetworkRequest, NetworkRequestCallback } from './types';
import {
  generateUUID,
  getErrorMessage,
  getHeaderValue,
  normalizeHeaders,
  parseXHRResponseHeaders,
  serializeBody,
  serializeFetchResponseBody,
  serializeXHRResponseBody,
} from './utils';

type FetchFunction = (input: unknown, init?: unknown) => Promise<unknown>;
type XHROpen = (method: string, url: string, ...rest: unknown[]) => unknown;
type XHRSend = (body?: unknown) => unknown;
type XHRSetRequestHeader = (header: string, value: string) => unknown;
type XHRPrototype = {
  open: XHROpen;
  send: XHRSend;
  setRequestHeader: XHRSetRequestHeader;
};

interface XHRMetadata {
  id: string;
  url: string;
  method: string;
  headers: Headers;
  timestamp: number;
}

type XHRLike = {
  status?: number;
  responseType?: string;
  response?: unknown;
  responseText?: string;
  addEventListener?: (event: string, listener: () => void) => void;
  removeEventListener?: (event: string, listener: () => void) => void;
  getAllResponseHeaders?: () => string;
};

const XHR_METADATA_KEY = '__reactiveNetworkMetadata__';

export default class NetworkInterceptor {
  private onRequest: NetworkRequestCallback = () => undefined;
  private started = false;
  private paused = false;

  private originalFetch: FetchFunction | null = null;
  private originalXHROpen: XHROpen | null = null;
  private originalXHRSend: XHRSend | null = null;
  private originalXHRSetRequestHeader: XHRSetRequestHeader | null = null;

  start(onRequest: NetworkRequestCallback): void {
    if (this.started) {
      return;
    }

    this.started = true;
    this.onRequest = onRequest;
    this.interceptFetch();
    this.interceptXHR();
  }

  stop(): void {
    if (!this.started) {
      return;
    }

    const globalRef = globalThis as unknown as {
      fetch?: FetchFunction;
      XMLHttpRequest?: { prototype?: XHRPrototype };
    };

    if (this.originalFetch) {
      globalRef.fetch = this.originalFetch;
    }

    const xhrPrototype = globalRef.XMLHttpRequest?.prototype;
    if (xhrPrototype) {
      if (this.originalXHROpen) {
        xhrPrototype.open = this.originalXHROpen;
      }
      if (this.originalXHRSend) {
        xhrPrototype.send = this.originalXHRSend;
      }
      if (this.originalXHRSetRequestHeader) {
        xhrPrototype.setRequestHeader = this.originalXHRSetRequestHeader;
      }
    }

    this.started = false;
    this.paused = false;
    this.originalFetch = null;
    this.originalXHROpen = null;
    this.originalXHRSend = null;
    this.originalXHRSetRequestHeader = null;
  }

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
  }

  private emitRequest(request: NetworkRequest): void {
    if (this.paused) {
      return;
    }

    try {
      this.onRequest(request);
    } catch (error) {
      console.error('[ReactiveNetwork] Request callback failed:', error);
    }
  }

  private interceptFetch(): void {
    const globalRef = globalThis as { fetch?: FetchFunction };
    if (typeof globalRef.fetch !== 'function') {
      return;
    }

    this.originalFetch = globalRef.fetch.bind(globalThis);
    const interceptor = this;

    globalRef.fetch = (async function reactiveNetworkFetch(
      input: unknown,
      init?: unknown
    ) {
      const requestId = generateUUID();
      const startTime = Date.now();
      const request = interceptor.buildFetchRequest(input, init, requestId, startTime);

      interceptor.emitRequest(request);

      try {
        const response = await interceptor.originalFetch!(input, init);
        const responseHeaders = normalizeHeaders(
          (response as { headers?: unknown }).headers
        );
        const clonedResponse = (
          response as { clone?: () => unknown }
        ).clone?.() ?? response;

        let responseBody: string | undefined;
        try {
          responseBody = await serializeFetchResponseBody(
            clonedResponse,
            responseHeaders
          );
        } catch (error) {
          console.warn('[ReactiveNetwork] Failed to parse fetch response body:', error);
          responseBody = '[Unable to read response body]';
        }

        interceptor.emitRequest({
          ...request,
          status: (response as { status?: number }).status,
          responseHeaders,
          responseBody,
          duration: Date.now() - startTime,
        });

        return response;
      } catch (error) {
        interceptor.emitRequest({
          ...request,
          error: getErrorMessage(error),
          duration: Date.now() - startTime,
        });
        throw error;
      }
    }) as FetchFunction;
  }

  private buildFetchRequest(
    input: unknown,
    init: unknown,
    id: string,
    timestamp: number
  ): NetworkRequest {
    const requestInit = (init as Record<string, unknown> | undefined) ?? {};
    const requestObject = (input as Record<string, unknown> | undefined) ?? {};

    const method =
      String(requestInit.method ?? requestObject.method ?? 'GET').toUpperCase();
    const url = this.resolveFetchUrl(input);
    const headers = normalizeHeaders(requestInit.headers ?? requestObject.headers);
    const contentType = getHeaderValue(headers, 'content-type');

    const bodySource =
      requestInit.body ??
      requestObject._bodyInit ??
      requestObject._bodyText ??
      requestObject.body;

    return {
      id,
      url,
      method,
      headers,
      body: serializeBody(bodySource, contentType),
      timestamp,
    };
  }

  private resolveFetchUrl(input: unknown): string {
    if (typeof input === 'string') {
      return input;
    }

    const asRecord = input as Record<string, unknown> | undefined;
    if (asRecord?.url && typeof asRecord.url === 'string') {
      return asRecord.url;
    }

    if (input && typeof (input as { toString?: () => string }).toString === 'function') {
      try {
        return (input as { toString: () => string }).toString();
      } catch {
        return '';
      }
    }

    return '';
  }

  private interceptXHR(): void {
    const globalRef = globalThis as unknown as {
      XMLHttpRequest?: { prototype?: XHRPrototype };
    };

    const xhrPrototype = globalRef.XMLHttpRequest?.prototype;
    if (!xhrPrototype) {
      return;
    }

    this.originalXHROpen = xhrPrototype.open as XHROpen;
    this.originalXHRSend = xhrPrototype.send as XHRSend;
    this.originalXHRSetRequestHeader =
      xhrPrototype.setRequestHeader as XHRSetRequestHeader;

    const interceptor = this;

    xhrPrototype.open = function open(
      this: Record<string, unknown>,
      method: string,
      url: string,
      ...rest: unknown[]
    ) {
      try {
        (this as Record<string, unknown>)[XHR_METADATA_KEY] = {
          id: generateUUID(),
          method: String(method || 'GET').toUpperCase(),
          url: String(url || ''),
          headers: {},
          timestamp: Date.now(),
        } as XHRMetadata;
      } catch (error) {
        console.error('[ReactiveNetwork] Failed to create XHR metadata:', error);
      }

      return interceptor.originalXHROpen!.call(this as unknown as never, method, url, ...rest);
    } as unknown as XHROpen;

    xhrPrototype.setRequestHeader = function setRequestHeader(
      this: Record<string, unknown>,
      header: string,
      value: string
    ) {
      try {
        const metadata = (this as Record<string, unknown>)[
          XHR_METADATA_KEY
        ] as XHRMetadata | undefined;
        if (metadata) {
          metadata.headers[String(header)] = String(value);
        }
      } catch (error) {
        console.error('[ReactiveNetwork] Failed to capture XHR request header:', error);
      }

      return interceptor.originalXHRSetRequestHeader!.call(
        this as unknown as never,
        header,
        value
      );
    } as unknown as XHRSetRequestHeader;

    xhrPrototype.send = function send(this: Record<string, unknown>, body?: unknown) {
      const xhr = this as XHRLike & Record<string, unknown>;
      const metadata = xhr[XHR_METADATA_KEY] as XHRMetadata | undefined;
      if (!metadata) {
        return interceptor.originalXHRSend!.call(this as unknown as never, body);
      }

      metadata.timestamp = Date.now();
      const contentType = getHeaderValue(metadata.headers, 'content-type');
      const initialRequest: NetworkRequest = {
        id: metadata.id,
        url: metadata.url,
        method: metadata.method,
        headers: { ...metadata.headers },
        body: serializeBody(body, contentType),
        timestamp: metadata.timestamp,
      };

      interceptor.emitRequest(initialRequest);

      let isFinalized = false;
      const removeListeners = () => {
        xhr.removeEventListener?.('loadend', onLoadEnd);
        xhr.removeEventListener?.('error', onError);
        xhr.removeEventListener?.('abort', onAbort);
        xhr.removeEventListener?.('timeout', onTimeout);
      };

      const finalizeRequest = (update: Partial<NetworkRequest>) => {
        if (isFinalized) {
          return;
        }

        isFinalized = true;
        removeListeners();

        interceptor.emitRequest({
          ...initialRequest,
          ...update,
          duration: Date.now() - metadata.timestamp,
        });
      };

      const onLoadEnd = () => {
        const responseHeaders = parseXHRResponseHeaders(
          xhr.getAllResponseHeaders?.() ?? ''
        );
        const responseBody = serializeXHRResponseBody(xhr, responseHeaders);

        finalizeRequest({
          status: typeof xhr.status === 'number' ? xhr.status : undefined,
          responseHeaders,
          responseBody,
        });
      };

      const onError = () => finalizeRequest({ error: 'Network request failed' });
      const onAbort = () => finalizeRequest({ error: 'Network request aborted' });
      const onTimeout = () =>
        finalizeRequest({ error: 'Network request timed out' });

      xhr.addEventListener?.('loadend', onLoadEnd);
      xhr.addEventListener?.('error', onError);
      xhr.addEventListener?.('abort', onAbort);
      xhr.addEventListener?.('timeout', onTimeout);

      try {
        return interceptor.originalXHRSend!.call(this as unknown as never, body);
      } catch (error) {
        finalizeRequest({ error: getErrorMessage(error) });
        throw error;
      }
    } as unknown as XHRSend;
  }
}
