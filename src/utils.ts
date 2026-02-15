import type { Headers } from './types';

export const MAX_BODY_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
const CONTENT_TRUNCATED_SUFFIX = '[Content truncated]';
const CIRCULAR_REFERENCE_MESSAGE = '[Circular reference detected]';

type GenericObject = Record<string, unknown>;

const toRecord = (value: unknown): GenericObject | null => {
  return typeof value === 'object' && value !== null
    ? (value as GenericObject)
    : null;
};

export const generateUUID = (): string => {
  const cryptoApi = (globalThis as { crypto?: { randomUUID?: () => string } })
    .crypto;
  if (cryptoApi?.randomUUID) {
    return cryptoApi.randomUUID();
  }

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    const value = char === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
};

export const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  return 'Network request failed';
};

const getByteLength = (content: string): number => {
  try {
    return encodeURIComponent(content).replace(/%[A-F\d]{2}/g, 'U').length;
  } catch {
    return content.length;
  }
};

export const truncateContent = (content: string): string => {
  if (getByteLength(content) <= MAX_BODY_SIZE_BYTES) {
    return content;
  }

  const suffix = CONTENT_TRUNCATED_SUFFIX;
  const maxPrefixBytes = MAX_BODY_SIZE_BYTES - getByteLength(suffix);
  if (maxPrefixBytes <= 0) {
    return suffix;
  }

  let endIndex = Math.min(content.length, maxPrefixBytes);
  let sliced = content.slice(0, endIndex);

  while (sliced.length > 0 && getByteLength(sliced) > maxPrefixBytes) {
    endIndex -= 1;
    sliced = content.slice(0, endIndex);
  }

  return `${sliced}${suffix}`;
};

export const safeStringify = (value: unknown): string => {
  try {
    const seen = new WeakSet<object>();

    const serialized = JSON.stringify(value, (_key, nestedValue) => {
      if (typeof nestedValue === 'object' && nestedValue !== null) {
        if (seen.has(nestedValue)) {
          return CIRCULAR_REFERENCE_MESSAGE;
        }
        seen.add(nestedValue);
      }

      return nestedValue;
    });

    return serialized ?? 'null';
  } catch {
    return CIRCULAR_REFERENCE_MESSAGE;
  }
};

const isBinaryBody = (body: unknown): boolean => {
  const blobConstructor = (globalThis as { Blob?: unknown }).Blob;
  if (
    typeof blobConstructor === 'function' &&
    body instanceof (blobConstructor as new () => unknown)
  ) {
    return true;
  }

  const formDataConstructor = (globalThis as { FormData?: unknown }).FormData;
  if (
    typeof formDataConstructor === 'function' &&
    body instanceof (formDataConstructor as new () => unknown)
  ) {
    return true;
  }

  const arrayBufferConstructor = (globalThis as { ArrayBuffer?: unknown })
    .ArrayBuffer;
  if (
    typeof arrayBufferConstructor === 'function' &&
    body instanceof (arrayBufferConstructor as new () => unknown)
  ) {
    return true;
  }

  const typedArray = (globalThis as { Uint8Array?: unknown }).Uint8Array;
  if (typeof typedArray === 'function' && body instanceof (typedArray as new () => unknown)) {
    return true;
  }

  return false;
};

const isContentTypeText = (contentType: string): boolean => {
  const normalized = contentType.toLowerCase();
  return (
    normalized.includes('application/json') ||
    normalized.includes('application/xml') ||
    normalized.includes('application/javascript') ||
    normalized.includes('application/x-www-form-urlencoded') ||
    normalized.startsWith('text/')
  );
};

export const isBinaryContentType = (contentType: string): boolean => {
  if (!contentType) {
    return false;
  }

  return !isContentTypeText(contentType);
};

export const normalizeHeaders = (headerInput: unknown): Headers => {
  const headers: Headers = {};
  if (!headerInput) {
    return headers;
  }

  if (Array.isArray(headerInput)) {
    for (const tuple of headerInput) {
      if (Array.isArray(tuple) && tuple.length >= 2) {
        headers[String(tuple[0])] = String(tuple[1]);
      }
    }
    return headers;
  }

  const possibleHeaders = headerInput as {
    forEach?: (callback: (value: unknown, key: unknown) => void) => void;
  };

  if (typeof possibleHeaders.forEach === 'function') {
    try {
      possibleHeaders.forEach((value, key) => {
        headers[String(key)] = String(value);
      });
      return headers;
    } catch {
      // Fall back to object parsing below.
    }
  }

  const record = toRecord(headerInput);
  if (!record) {
    return headers;
  }

  for (const [key, value] of Object.entries(record)) {
    if (value !== undefined && value !== null) {
      headers[key] = String(value);
    }
  }

  return headers;
};

export const getHeaderValue = (headers: Headers, key: string): string => {
  const directMatch = headers[key];
  if (directMatch !== undefined) {
    return directMatch;
  }

  const lowerKey = key.toLowerCase();
  for (const [headerKey, headerValue] of Object.entries(headers)) {
    if (headerKey.toLowerCase() === lowerKey) {
      return headerValue;
    }
  }

  return '';
};

const isURLSearchParamsBody = (body: unknown): boolean => {
  const constructor = (globalThis as { URLSearchParams?: unknown }).URLSearchParams;
  return (
    typeof constructor === 'function' &&
    body instanceof (constructor as new () => object)
  );
};

const isReactNativeFormDataShape = (value: unknown): boolean => {
  const record = toRecord(value);
  return !!record && Array.isArray(record._parts);
};

export const serializeBody = (
  body: unknown,
  contentType?: string,
  forResponse = false
): string | null => {
  if (body === undefined || body === null) {
    return null;
  }

  if (typeof body === 'string') {
    return truncateContent(body);
  }

  if (typeof body === 'number' || typeof body === 'boolean') {
    return String(body);
  }

  if (isURLSearchParamsBody(body)) {
    return truncateContent((body as { toString: () => string }).toString());
  }

  if (isBinaryBody(body) || isReactNativeFormDataShape(body)) {
    if (forResponse) {
      return `[Binary data: ${contentType || 'unknown'}]`;
    }

    return '[Binary data]';
  }

  const serialized = safeStringify(body);
  return truncateContent(serialized);
};

export const parseXHRResponseHeaders = (headerString: string): Headers => {
  const headers: Headers = {};
  if (!headerString) {
    return headers;
  }

  const lines = headerString.split('\r\n');
  for (const line of lines) {
    if (!line) {
      continue;
    }

    const separatorIndex = line.indexOf(':');
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    if (key) {
      headers[key] = value;
    }
  }

  return headers;
};

export const serializeFetchResponseBody = async (
  response: unknown,
  responseHeaders: Headers
): Promise<string | undefined> => {
  const maybeResponse = response as {
    json?: () => Promise<unknown>;
    text?: () => Promise<string>;
  };

  const contentType = getHeaderValue(responseHeaders, 'content-type');
  if (contentType && isBinaryContentType(contentType)) {
    return `[Binary data: ${contentType}]`;
  }

  if (contentType.toLowerCase().includes('application/json')) {
    try {
      if (typeof maybeResponse.json === 'function') {
        const json = await maybeResponse.json();
        return truncateContent(safeStringify(json));
      }
    } catch {
      // Fall back to text parsing below.
    }
  }

  if (typeof maybeResponse.text === 'function') {
    try {
      const text = await maybeResponse.text();
      return truncateContent(text);
    } catch {
      return '[Unable to read response body]';
    }
  }

  return undefined;
};

export const serializeXHRResponseBody = (
  xhr: unknown,
  responseHeaders: Headers
): string | undefined => {
  const request = xhr as {
    responseType?: string;
    response?: unknown;
    responseText?: string;
  };

  const responseType = request.responseType ?? '';
  const contentType = getHeaderValue(responseHeaders, 'content-type');

  if (responseType === '' || responseType === 'text') {
    if (typeof request.responseText === 'string') {
      return truncateContent(request.responseText);
    }
    if (typeof request.response === 'string') {
      return truncateContent(request.response);
    }
    return undefined;
  }

  if (responseType === 'json') {
    const serialized = serializeBody(request.response, contentType, true);
    return serialized ?? undefined;
  }

  if (responseType === 'blob' || responseType === 'arraybuffer') {
    return `[Binary data: ${contentType || responseType}]`;
  }

  if (contentType && isBinaryContentType(contentType)) {
    return `[Binary data: ${contentType}]`;
  }

  const serialized = serializeBody(request.response, contentType, true);
  return serialized ?? undefined;
};
