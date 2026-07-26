import type { ConnectionStatus } from "@cs-inv-edit/contracts";
import type { ResultAsync } from "neverthrow";
import type { AppError } from "./result-http.js";

interface SteamStatusWatcherOptions {
  socketUrl: string;
  readStatus: () => ResultAsync<ConnectionStatus, AppError>;
  listener: (status: ConnectionStatus) => void;
  parseMessage: (message: string) => ConnectionStatus | undefined;
}

export function watchSteamStatusWithRecovery(
  options: SteamStatusWatcherOptions,
): () => void {
  let socket: WebSocket | undefined;
  let stopped = false;
  let reconnectDelay = 500;
  let reconnectTimer: ReturnType<typeof globalThis.setTimeout> | undefined;
  let pollPending = false;

  const poll = () => {
    if (stopped || pollPending) return;
    pollPending = true;
    void options
      .readStatus()
      .match(options.listener, () => undefined)
      .finally(() => {
        pollPending = false;
      });
  };

  const scheduleReconnect = () => {
    if (stopped || reconnectTimer !== undefined) return;
    poll();
    reconnectTimer = globalThis.setTimeout(() => {
      reconnectTimer = undefined;
      connect();
    }, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, 5_000);
  };

  const connect = () => {
    if (stopped) return;
    socket = new WebSocket(options.socketUrl);
    socket.onopen = () => {
      reconnectDelay = 500;
    };
    socket.onmessage = (event) => {
      const status = options.parseMessage(String(event.data));
      if (status) options.listener(status);
    };
    socket.onerror = () => socket?.close();
    socket.onclose = scheduleReconnect;
  };

  const fallbackPoll = globalThis.setInterval(() => {
    if (!socket || socket.readyState !== WebSocket.OPEN) poll();
  }, 1_000);
  connect();

  return () => {
    stopped = true;
    socket?.close();
    if (reconnectTimer !== undefined) globalThis.clearTimeout(reconnectTimer);
    globalThis.clearInterval(fallbackPoll);
  };
}
