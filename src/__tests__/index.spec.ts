const mockRemoveAppStateListener = jest.fn();
const mockAddAppStateListener = jest
  .fn()
  .mockReturnValue({ remove: mockRemoveAppStateListener });

jest.mock('react-native', () => ({
  AppState: {
    currentState: 'active',
    addEventListener: mockAddAppStateListener,
  },
}));

const mockInterceptorStart = jest.fn();
const mockInterceptorStop = jest.fn();
const mockInterceptorPause = jest.fn();
const mockInterceptorResume = jest.fn();

const mockNetworkInterceptorConstructor = jest.fn().mockImplementation(() => ({
  start: mockInterceptorStart,
  stop: mockInterceptorStop,
  pause: mockInterceptorPause,
  resume: mockInterceptorResume,
}));

jest.mock('../interceptor', () => ({
  __esModule: true,
  default: mockNetworkInterceptorConstructor,
}));

const mockStreamingConnect = jest.fn();
const mockStreamingDisconnect = jest.fn();
const mockStreamingSendRequest = jest.fn();

const mockDesktopStreamingConstructor = jest.fn().mockImplementation(() => ({
  connect: mockStreamingConnect,
  disconnect: mockStreamingDisconnect,
  sendRequest: mockStreamingSendRequest,
}));

jest.mock('../desktopStreaming', () => ({
  __esModule: true,
  default: mockDesktopStreamingConstructor,
}));

import {
  connectToDesktop,
  disconnectFromDesktop,
  startNetworkLogging,
  stopNetworkLogging,
} from '..';

describe('@reactive-network/logger public API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAddAppStateListener.mockReturnValue({
      remove: mockRemoveAppStateListener,
    });
  });

  afterEach(() => {
    stopNetworkLogging();
  });

  it('starts interceptor and desktop streaming when host is provided', () => {
    startNetworkLogging({
      desktopHost: '192.168.1.100',
      desktopPort: 8089,
    });

    expect(mockNetworkInterceptorConstructor).toHaveBeenCalledTimes(1);
    expect(mockInterceptorStart).toHaveBeenCalledTimes(1);
    expect(mockDesktopStreamingConstructor).toHaveBeenCalledWith({
      host: '192.168.1.100',
      port: 8089,
      autoReconnect: undefined,
      reconnectInterval: undefined,
    });
    expect(mockStreamingConnect).toHaveBeenCalledTimes(1);
    expect(mockAddAppStateListener).toHaveBeenCalledTimes(1);
  });

  it('does not start interceptor twice', () => {
    startNetworkLogging();
    startNetworkLogging();

    expect(mockNetworkInterceptorConstructor).toHaveBeenCalledTimes(1);
    expect(mockInterceptorStart).toHaveBeenCalledTimes(1);
  });

  it('connectToDesktop reconnects with the new host', () => {
    startNetworkLogging({
      desktopHost: '192.168.1.100',
      desktopPort: 8089,
    });

    connectToDesktop('192.168.1.101', 8090);

    expect(mockDesktopStreamingConstructor).toHaveBeenNthCalledWith(1, {
      host: '192.168.1.100',
      port: 8089,
      autoReconnect: undefined,
      reconnectInterval: undefined,
    });
    expect(mockDesktopStreamingConstructor).toHaveBeenNthCalledWith(2, {
      host: '192.168.1.101',
      port: 8090,
      autoReconnect: undefined,
      reconnectInterval: undefined,
    });
    expect(mockStreamingDisconnect).toHaveBeenCalledTimes(1);
    expect(mockStreamingConnect).toHaveBeenCalledTimes(2);
  });

  it('disconnectFromDesktop closes streaming safely', () => {
    startNetworkLogging({ desktopHost: '192.168.1.100' });

    disconnectFromDesktop();
    disconnectFromDesktop();

    expect(mockStreamingDisconnect).toHaveBeenCalledTimes(1);
  });

  it('pauses in background and resumes when active', () => {
    startNetworkLogging();
    const appStateHandler = mockAddAppStateListener.mock.calls[0]?.[1];

    appStateHandler?.('background');
    appStateHandler?.('active');

    expect(mockInterceptorPause).toHaveBeenCalledTimes(1);
    expect(mockInterceptorResume).toHaveBeenCalledTimes(2); // initial active + foreground
  });

  it('stopNetworkLogging disconnects and removes listeners', () => {
    startNetworkLogging({ desktopHost: '192.168.1.100' });
    stopNetworkLogging();

    expect(mockInterceptorStop).toHaveBeenCalledTimes(1);
    expect(mockStreamingDisconnect).toHaveBeenCalledTimes(1);
    expect(mockRemoveAppStateListener).toHaveBeenCalledTimes(1);
  });
});
