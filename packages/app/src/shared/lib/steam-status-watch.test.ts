import { afterEach, describe, expect, it, vi } from "vitest";
import { okAsync } from "neverthrow";
import type { ConnectionStatus } from "@cs-inv-edit/contracts";
import { watchSteamStatusWithRecovery } from "./steam-status-watch.js";

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  readonly url: string;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  closed = false;

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  close() {
    this.closed = true;
    this.onclose?.();
  }

  emitMessage(data: unknown) {
    this.onmessage?.({ data });
  }
}

const connected: ConnectionStatus = {
  state: "connected",
  steamId: "76561198000000000",
  accountName: "fixture-account",
};

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  FakeWebSocket.instances = [];
});

describe("watchSteamStatusWithRecovery", () => {
  it("delivers socket messages and closes without reconnecting after stop", () => {
    vi.useFakeTimers();
    vi.stubGlobal("WebSocket", FakeWebSocket);
    const listener = vi.fn();
    const readStatus = vi.fn(() => okAsync(connected));

    const stop = watchSteamStatusWithRecovery({
      socketUrl: "ws://fixture.test/status",
      readStatus,
      listener,
      parseMessage: (message) =>
        message === "connected" ? connected : undefined,
    });

    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(FakeWebSocket.instances[0]?.url).toBe("ws://fixture.test/status");
    FakeWebSocket.instances[0]?.emitMessage("connected");
    expect(listener).toHaveBeenCalledWith(connected);

    stop();
    vi.advanceTimersByTime(10_000);
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(FakeWebSocket.instances[0]?.closed).toBe(true);
  });

  it("polls status and reconnects after a socket close", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("WebSocket", FakeWebSocket);
    const listener = vi.fn();
    const readStatus = vi.fn(() => okAsync(connected));

    const stop = watchSteamStatusWithRecovery({
      socketUrl: "ws://fixture.test/status",
      readStatus,
      listener,
      parseMessage: () => undefined,
    });

    FakeWebSocket.instances[0]?.onclose?.();
    await vi.advanceTimersByTimeAsync(500);

    expect(readStatus).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(connected);
    expect(FakeWebSocket.instances).toHaveLength(2);
    stop();
  });
});
