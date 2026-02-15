import React, { useEffect, useState } from 'react';
import { Button, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import {
  connectToDesktop,
  disconnectFromDesktop,
  startNetworkLogging,
  stopNetworkLogging,
} from '@reactive-network/logger';

const DESKTOP_HOST = '192.168.1.100';
const DESKTOP_PORT = 8089;

const makeFetchRequest = async () => {
  await fetch('https://jsonplaceholder.typicode.com/todos/1');
};

const makeFetchPostRequest = async () => {
  const largePayload = {
    message: 'hello from reactive-network logger',
    repeated: 'x'.repeat(1024 * 32),
  };

  await fetch('https://postman-echo.com/post', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(largePayload),
  });
};

const makeXHRRequest = async () => {
  await new Promise<void>((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', 'https://jsonplaceholder.typicode.com/users/1');
    xhr.onloadend = () => resolve();
    xhr.onerror = () => resolve();
    xhr.send();
  });
};

const makeConcurrentRequests = async () => {
  await Promise.all(
    Array.from({ length: 20 }).map((_value, index) =>
      fetch(`https://httpstat.us/200?sleep=${100 + index * 10}`)
    )
  );
};

export default function App() {
  const [status, setStatus] = useState('Logger idle');

  useEffect(() => {
    if (!__DEV__) {
      return;
    }

    startNetworkLogging({
      desktopHost: DESKTOP_HOST,
      desktopPort: DESKTOP_PORT,
    });
    setStatus(`Logging to ws://${DESKTOP_HOST}:${DESKTOP_PORT}`);

    return () => {
      stopNetworkLogging();
    };
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>@reactive-network/logger example</Text>
      <Text style={styles.description}>
        Open the Reactive Network desktop app, update the desktop host below, then
        trigger requests.
      </Text>
      <Text style={styles.status}>{status}</Text>

      <View style={styles.actions}>
        <View style={styles.actionItem}>
          <Button
            title="Connect to desktop"
            onPress={() => {
              connectToDesktop(DESKTOP_HOST, DESKTOP_PORT);
              setStatus(`Connected to ws://${DESKTOP_HOST}:${DESKTOP_PORT}`);
            }}
          />
        </View>
        <View style={styles.actionItem}>
          <Button
            title="Disconnect desktop"
            onPress={() => {
              disconnectFromDesktop();
              setStatus('Desktop disconnected');
            }}
          />
        </View>
        <View style={styles.actionItem}>
          <Button
            title="GET request (fetch)"
            onPress={() => {
              makeFetchRequest().catch(() => undefined);
            }}
          />
        </View>
        <View style={styles.actionItem}>
          <Button
            title="POST request (fetch)"
            onPress={() => {
              makeFetchPostRequest().catch(() => undefined);
            }}
          />
        </View>
        <View style={styles.actionItem}>
          <Button
            title="GET request (XHR)"
            onPress={() => {
              makeXHRRequest().catch(() => undefined);
            }}
          />
        </View>
        <View style={styles.actionItem}>
          <Button
            title="20 concurrent requests"
            onPress={() => {
              makeConcurrentRequests().catch(() => undefined);
            }}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 32,
    backgroundColor: '#121212',
  },
  title: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 8,
  },
  description: {
    color: '#a0a0a0',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
  },
  status: {
    color: '#90caf9',
    marginBottom: 20,
  },
  actions: {
    marginTop: 8,
  },
  actionItem: {
    marginBottom: 10,
  },
});
