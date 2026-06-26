import { createMemo, createSignal, onMount, Show } from "solid-js";
import { AppShell } from "./components/AppShell";
import { InventoryView } from "./components/InventoryView";
import { StorageView } from "./components/StorageView";
import { TradeUpView } from "./components/TradeUpView";
import { StickersView } from "./components/StickersView";
import { OperationsView } from "./components/OperationsView";
import { SettingsView } from "./components/SettingsView";
import type { AppBackendClient, BackendEvent, ConnectionStatus, FeatureSettings, HealthStatus, InventorySnapshot, OperationReceipt } from "./lib/backend";
import { defaultFeatureSettings } from "./lib/backend";

export interface AppProps {
  backend: AppBackendClient;
  platform: "desktop" | "web";
}

export function App(props: AppProps) {
  const [activeView, setActiveView] = createSignal<"inventory" | "storage" | "tradeups" | "stickers" | "operations" | "settings">("inventory");
  const [health, setHealth] = createSignal<HealthStatus | null>(null);
  const [healthLoading, setHealthLoading] = createSignal(false);
  const [inventory, setInventory] = createSignal<InventorySnapshot | null>(null);
  const [inventoryLoading, setInventoryLoading] = createSignal(false);
  const [inventoryError, setInventoryError] = createSignal<string | null>(null);
  const [events, setEvents] = createSignal<BackendEvent[]>([]);
  const [settings, setSettings] = createSignal<FeatureSettings>(defaultFeatureSettings);
  const [connection, setConnection] = createSignal<ConnectionStatus | null>(null);
  const [operationReceipts, setOperationReceipts] = createSignal<OperationReceipt[]>([]);
  const [backendUrl, setBackendUrl] = createSignal("http://127.0.0.1:7331");

  const loadHealth = async () => {
    setHealthLoading(true);
    try {
      const result = await props.backend.health();
      setHealth(result);
    } catch (error) {
      setHealth(null);
      setInventoryError(error instanceof Error ? error.message : "Health check failed");
    } finally {
      setHealthLoading(false);
    }
  };

  const loadInventory = async (force = false) => {
    setInventoryLoading(true);
    try {
      const result = force ? await props.backend.refreshInventory() : await props.backend.inventory();
      setInventory(result);
      setInventoryError(null);
    } catch (error) {
      setInventoryError(error instanceof Error ? error.message : "Inventory request failed");
    } finally {
      setInventoryLoading(false);
    }
  };

  const loadEvents = async () => {
    try {
      const result = await props.backend.events();
      setEvents(result);
    } catch {
      setEvents([]);
    }
  };

  const loadSettings = async () => {
    try {
      const result = await props.backend.getSettings();
      setSettings(result);
    } catch {
      setSettings(defaultFeatureSettings);
    }
  };

  const submitOperation = async (type: string, input?: unknown) => {
    try {
      const receipt = await props.backend.submitOperation(type, input);
      setOperationReceipts((current) => [receipt, ...current].slice(0, 20));
      await loadEvents();
      return receipt;
    } catch (error) {
      const fallback: OperationReceipt = {
        operationId: `op_error_${Date.now()}`,
        type,
        state: "failed",
        createdAt: new Date().toISOString(),
        message: error instanceof Error ? error.message : "submit failed",
      };
      setOperationReceipts((current) => [fallback, ...current].slice(0, 20));
      return fallback;
    }
  };

  const saveSettings = async () => {
    try {
      const result = await props.backend.updateSettings(settings());
      setSettings(result);
    } catch {
      // noop: view remains local for now
    }
  };

  const toggleSetting = (key: keyof FeatureSettings) => {
    setSettings((current) => ({ ...current, [key]: !current[key] }));
  };

  const connectSteam = async () => {
    setConnection({ state: "connecting", detail: "Requesting mock Steam connection" });
    try {
      const result = await props.backend.connectSteam({ platform: props.platform });
      setConnection(result);
    } catch (error) {
      setConnection({ state: "error", detail: error instanceof Error ? error.message : "Steam connection unavailable" });
    }
  };

  const disconnectSteam = async () => {
    try {
      const result = await props.backend.disconnectSteam();
      setConnection(result);
    } catch (error) {
      setConnection({ state: "error", detail: error instanceof Error ? error.message : "Disconnect failed" });
    }
  };

  onMount(() => {
    void loadHealth();
    void loadInventory();
    void loadEvents();
    void loadSettings();
  });

  const inventoryItems = createMemo(() => inventory()?.items ?? []);
  const changeView = (view: "inventory" | "storage" | "tradeups" | "stickers" | "operations" | "settings") => setActiveView(view);
  const devMode = typeof window !== "undefined" && (window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost");

  return (
    <AppShell platform={props.platform} activeView={activeView()} health={health()} healthLoading={healthLoading()} onNavigate={changeView}>
      <Show when={activeView() === "inventory"}>
        <InventoryView inventory={inventory()} error={inventoryError()} loading={inventoryLoading()} onRefresh={() => void loadInventory(true)} />
      </Show>
      <Show when={activeView() === "storage"}>
        <StorageView inventory={inventory()} settings={{ enableStorageMutations: settings().enableStorageMutations }} loading={inventoryLoading()} pending={null} onSubmit={submitOperation} onClear={() => setOperationReceipts([])} />
      </Show>
      <Show when={activeView() === "tradeups"}>
        <TradeUpView inventory={inventoryItems()} settings={settings()} onSubmit={submitOperation} />
      </Show>
      <Show when={activeView() === "stickers"}>
        <StickersView items={inventoryItems()} settings={settings()} dev={devMode} onSubmit={submitOperation} />
      </Show>
      <Show when={activeView() === "operations"}>
        <OperationsView events={events()} receipts={operationReceipts()} loading={inventoryLoading()} onRefresh={() => void loadEvents()} />
      </Show>
      <Show when={activeView() === "settings"}>
        <SettingsView
          health={health()}
          connection={connection()}
          settings={settings()}
          backendUrl={backendUrl()}
          onChangeBackendUrl={(value) => setBackendUrl(value)}
          onSaveSettings={() => void saveSettings()}
          onToggleSetting={toggleSetting}
          onConnectSteam={() => void connectSteam()}
          onDisconnectSteam={() => void disconnectSteam()}
        />
      </Show>
    </AppShell>
  );
}
