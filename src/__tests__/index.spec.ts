jest.mock('react-native', () => ({
  AppState: {
    currentState: 'active',
    addEventListener: jest.fn(),
  },
}));

jest.mock('../interceptor', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    start: jest.fn(),
    stop: jest.fn(),
    pause: jest.fn(),
    resume: jest.fn(),
  })),
}));

jest.mock('../desktopStreaming', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    connect: jest.fn(),
    disconnect: jest.fn(),
    sendRequest: jest.fn(),
  })),
}));

import { AppState } from 'react-native';
import DesktopStreaming from '../desktopStreaming';
import NetworkInterceptor from '../interceptor';
import {
  connectToDesktop,
  disconnectFromDesktop,
  startNetworkLogging,
  stopNetworkLogging,
} from '..';

describe('@reactive-network/logger public API', () => {
  const mockRemoveAppStateListener = jest.fn();
  const mockAddAppStateListener = AppState
    .addEventListener as unknown as jest.Mock;
  const mockNetworkInterceptorConstructor =
    NetworkInterceptor as unknown as jest.Mock;
  const mockDesktopStreamingConstructor = DesktopStreaming as unknown as jest.Mock;

  const getInterceptorInstance = (index = 0) =>
    mockNetworkInterceptorConstructor.mock.results[index]?.value as {
      start: jest.Mock;
      stop: jest.Mock;
      pause: jest.Mock;
      resume: jest.Mock;
    };

  const getStreamingInstance = (index = 0) =>
    mockDesktopStreamingConstructor.mock.results[index]?.value as {
      connect: jest.Mock;
      disconnect: jest.Mock;
      sendRequest: jest.Mock;
    };

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

    const interceptorInstance = getInterceptorInstance();
    const streamingInstance = getStreamingInstance();

    expect(mockNetworkInterceptorConstructor).toHaveBeenCalledTimes(1);
    expect(interceptorInstance.start).toHaveBeenCalledTimes(1);
    expect(mockDesktopStreamingConstructor).toHaveBeenCalledWith({
      host: '192.168.1.100',
      port: 8089,
      autoReconnect: undefined,
      reconnectInterval: undefined,
    });
    expect(streamingInstance.connect).toHaveBeenCalledTimes(1);
    expect(mockAddAppStateListener).toHaveBeenCalledTimes(1);
  });

  it('does not start interceptor twice', () => {
    startNetworkLogging();
    startNetworkLogging();

    expect(mockNetworkInterceptorConstructor).toHaveBeenCalledTimes(1);
    expect(getInterceptorInstance().start).toHaveBeenCalledTimes(1);
  });

  it('connectToDesktop reconnects with the new host', () => {
    startNetworkLogging({
      desktopHost: '192.168.1.100',
      desktopPort: 8089,
    });

    connectToDesktop('192.168.1.101', 8090);

    const firstStreamingInstance = getStreamingInstance(0);
    const secondStreamingInstance = getStreamingInstance(1);

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
    expect(firstStreamingInstance.disconnect).toHaveBeenCalledTimes(1);
    expect(secondStreamingInstance.connect).toHaveBeenCalledTimes(1);
  });

  it('disconnectFromDesktop closes streaming safely', () => {
    startNetworkLogging({ desktopHost: '192.168.1.100' });

    disconnectFromDesktop();
    disconnectFromDesktop();

    expect(getStreamingInstance().disconnect).toHaveBeenCalledTimes(1);
  });

  it('pauses in background and resumes when active', () => {
    startNetworkLogging();
    const appStateHandler = mockAddAppStateListener.mock.calls[0]?.[1];

    appStateHandler?.('background');
    appStateHandler?.('active');

    expect(getInterceptorInstance().pause).toHaveBeenCalledTimes(1);
    expect(getInterceptorInstance().resume).toHaveBeenCalledTimes(2); // initial active + foreground
  });

  it('stopNetworkLogging disconnects and removes listeners', () => {
    startNetworkLogging({ desktopHost: '192.168.1.100' });
    stopNetworkLogging();

    expect(getInterceptorInstance().stop).toHaveBeenCalledTimes(1);
    expect(getStreamingInstance().disconnect).toHaveBeenCalledTimes(1);
    expect(mockRemoveAppStateListener).toHaveBeenCalledTimes(1);
  });
});
