import { createResource, createSignal, onCleanup } from "solid-js";
import { errAsync } from "neverthrow";
import type { ResultAsync } from "neverthrow";
import { type ProtocolTraceEntry } from "@cs-inv-edit/contracts";
import type { AppError } from "./lib/result-http.js";

import type { AppProps } from "./app-controller.js";

export function createAppResources(props: AppProps) {
  const resourceValue = <T>(result: ResultAsync<T, AppError>) =>
    result.match(
      (value) => value,
      (error) => {
        console.error(error.message, error.cause);
        return undefined;
      },
    );
  const [health] = createResource(() => resourceValue(props.backend.health()));
  const [settings, { refetch: refetchSettings }] = createResource(() =>
    resourceValue(props.backend.settings()),
  );

  let protocolTraceCursor = 0;
  let protocolTracePolling = false;
  const [tf2ProtocolEntries, setTF2ProtocolEntries] = createSignal<
    ProtocolTraceEntry[]
  >([]);
  const pollProtocolTrace = () => {
    if (
      protocolTracePolling ||
      !props.backend.protocolTrace ||
      settings()?.featureFlags.enableProtocolConsole === false
    )
      return;
    protocolTracePolling = true;
    void props.backend.protocolTrace(protocolTraceCursor).match(
      (entries) => {
        for (const entry of entries) {
          protocolTraceCursor = Math.max(protocolTraceCursor, entry.id);
          if (
            entry.appId === 440 &&
            entry.direction === "received" &&
            entry.decoded !== undefined
          ) {
            setTF2ProtocolEntries((current) => [...current, entry].slice(-200));
          }

          // ClientFromGC/ClientToGC are transport wrappers. Their `payload`
          // field is the same message recorded immediately afterwards by the
          // game-coordinator trace, where it can be decoded with the correct
          // app-specific GameTracking descriptor. Logging both only produces
          // a duplicate base64 payload and outer-envelope hex dump.
          if (
            entry.layer === "steam-cm" &&
            (entry.name === "EMsg_ClientFromGC" ||
              entry.name === "EMsg_ClientToGC")
          ) {
            continue;
          }
          const notParsedWarning =
            entry.decoded === undefined ? " [WARNING - NOT PARSED]" : "";
          const protocolLabel = entry.protobuf ? "protobuf" : "steam protocol";
          console.groupCollapsed(
            `[${protocolLabel} ${entry.direction}]${notParsedWarning} ${entry.layer} ${entry.name} emsg=${entry.emsg}${entry.appId ? ` appid=${entry.appId}` : ""}`,
          );
          if (entry.decoded !== undefined) {
            console.debug("decoded protobuf", entry.decoded);
          } else if (entry.decodeError) {
            console.warn("protobuf decode unavailable", entry.decodeError);
          }
          if (entry.decoded !== undefined) {
            const { bodyHex: _bodyHex, ...structuredEntry } = entry;
            console.debug("trace entry", structuredEntry);
          } else {
            console.debug("trace entry", entry);
          }
          if (entry.decoded === undefined && entry.bodyHex) {
            console.debug(
              `raw body fallback (${entry.bodyBytes} bytes): ${entry.bodyHex}`,
            );
          }
          console.groupEnd();
        }
        protocolTracePolling = false;
      },
      (error) => {
        protocolTracePolling = false;
        console.warn("[protobuf trace] polling failed", error);
      },
    );
  };
  const protocolTraceTimer = globalThis.setInterval(pollProtocolTrace, 750);
  onCleanup(() => globalThis.clearInterval(protocolTraceTimer));
  const [inventory, { refetch: refetchInventory }] = createResource(() =>
    resourceValue(props.backend.inventory()),
  );
  const [steamInventory, { refetch: refetchSteamInventory }] = createResource(
    () =>
      settings()?.featureFlags.enableSteamInventory
        ? ("steam" as const)
        : false,
    (game) => resourceValue(props.backend.gameInventory(game)),
  );
  const [tf2Inventory, { refetch: refetchTF2Inventory }] = createResource(
    () =>
      settings()?.featureFlags.enableTf2Inventory ? ("tf2" as const) : false,
    (game) => resourceValue(props.backend.gameInventory(game)),
  );
  const [tf2Features, { refetch: refetchTF2Features }] = createResource(
    () => (settings()?.featureFlags.enableTf2Inventory ? true : false),
    () => resourceValue(props.backend.tf2Features()),
  );
  const tf2FeatureTimer = globalThis.setInterval(() => {
    if (settings()?.featureFlags.enableTf2Inventory) {
      void refetchTF2Features();
    }
  }, 1500);
  onCleanup(() => globalThis.clearInterval(tf2FeatureTimer));
  const [cs2Features, { refetch: refetchCS2Features }] = createResource(() =>
    resourceValue(props.backend.cs2Features()),
  );
  const cs2FeatureTimer = globalThis.setInterval(() => {
    void refetchCS2Features();
  }, 1500);
  onCleanup(() => globalThis.clearInterval(cs2FeatureTimer));
  const [dota2Inventory, { refetch: refetchDota2Inventory }] = createResource(
    () =>
      settings()?.featureFlags.enableDota2Inventory
        ? ("dota2" as const)
        : false,
    (game) => resourceValue(props.backend.gameInventory(game)),
  );
  const [armory, { refetch: refetchArmory, mutate: setArmory }] =
    createResource(() => resourceValue(props.backend.armory()));
  const [store, { refetch: refetchStore, mutate: setStore }] = createResource(
    () => resourceValue(props.backend.store()),
  );
  const [tf2Store, { refetch: refetchTF2Store, mutate: setTF2Store }] =
    createResource(
      () => (settings()?.featureFlags.enableTf2Store !== false ? true : false),
      () => resourceValue(props.backend.tf2Store()),
    );
  const [trades, { mutate: setTrades }] = createResource(() =>
    resourceValue(props.backend.trades()),
  );
  const [tradeAccounts, { mutate: setTradeAccounts }] = createResource(() =>
    resourceValue(props.backend.tradeAccounts()),
  );
  const [receipts, { refetch: refetchOperations }] = createResource(() =>
    resourceValue(props.backend.operations()),
  );
  const [events, { refetch: refetchEvents }] = createResource(() =>
    resourceValue(props.backend.events()),
  );
  const [connection, { refetch: refetchConnection, mutate: setConnection }] =
    createResource(() =>
      resourceValue(
        props.backend.steamStatus?.() ??
          errAsync({ message: "Steam status unavailable" }),
      ),
    );

  return {
    health,
    settings,
    refetchSettings,
    tf2ProtocolEntries,
    inventory,
    refetchInventory,
    steamInventory,
    refetchSteamInventory,
    tf2Inventory,
    refetchTF2Inventory,
    tf2Features,
    refetchTF2Features,
    cs2Features,
    refetchCS2Features,
    dota2Inventory,
    refetchDota2Inventory,
    armory,
    refetchArmory,
    setArmory,
    store,
    refetchStore,
    setStore,
    tf2Store,
    refetchTF2Store,
    setTF2Store,
    trades,
    setTrades,
    tradeAccounts,
    setTradeAccounts,
    receipts,
    refetchOperations,
    events,
    refetchEvents,
    connection,
    refetchConnection,
    setConnection,
  };
}
