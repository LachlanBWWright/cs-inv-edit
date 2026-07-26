import {
  createEffect,
  createMemo,
  createSignal,
  Match,
  Show,
  Switch,
} from "solid-js";
import type {
  ApplyStatTrakSwapRequest,
  ArmoryRedeemRequest,
  ArmorySnapshot,
  ApplyStrangePartRequest,
  ApplyToolToBaseItemRequest,
  ApplyToolToItemRequest,
  ConnectionStatus,
  DeleteItemRequest,
  GiftItemRequest,
  GameInventorySnapshot,
  HealthStatus,
  InventoryItemDto,
  InventorySnapshot,
  OperationEvent,
  OperationReceipt,
  OpenContainerRequest,
  PriceScanResult,
  ProtocolTraceEntry,
  RemoveItemNameRequest,
  RelatedItemDto,
  SetItemNameRequest,
  SettingsData,
  StoreSnapshot,
  PurchaseSession,
  InitializeStorePurchaseRequest,
  SteamAccountProfile,
  SteamAccountTradesCollection,
  SteamTradesSnapshot,
  SteamInventoryServiceGames,
  TF2FeatureSnapshot,
  UseItemRequest,
  UseMultipleItemsRequest,
} from "@cs-inv-edit/contracts";
import { AccountView } from "./components/AccountView.js";
import { ArmoryView } from "./components/ArmoryView.js";
import { StoreView } from "./components/StoreView.js";
import { InventoryView } from "./components/InventoryView.js";
import { GameInventoryView } from "./components/GameInventoryView.js";
import { TF2FeaturesView } from "./components/TF2FeaturesView.js";
import { TradesView } from "./components/TradesView.js";
import { Sidebar } from "./components/Sidebar.js";
import { Alert } from "./components/ui/Alert.js";
import {
  ToastViewport,
  type ToastItem,
} from "./components/ui/ToastViewport.js";
import type { AppScreen } from "./view.js";
import {
  isEconomyInventoryScreen,
  isInventoryScreen,
  isTF2FeatureScreen,
} from "./view.js";
import {
  itemWeaponName,
  type InventorySort,
} from "./components/inventory-view-utils.js";
import { economyCategoryOptions } from "./components/game-inventory-utils.js";

export interface AppViewProps {
  view: AppScreen;
  setView: (view: AppScreen) => void;
  selectedItemId: string | undefined;
  setSelectedItemId: (itemId: string | undefined) => void;
  statusMessage: string;
  health: HealthStatus | undefined;
  connection: ConnectionStatus | undefined;
  accounts: SteamAccountProfile[];
  accountUsername: string;
  inventory: InventorySnapshot | undefined;
  inventoryLoading: boolean;
  steamInventory: GameInventorySnapshot | undefined;
  steamServiceInventory: GameInventorySnapshot | undefined;
  steamServiceGames: SteamInventoryServiceGames | undefined;
  steamServiceGamesLoading: boolean;
  steamServiceAppId: number | undefined;
  setSteamServiceAppId: (appId: number | undefined) => void;
  tf2Inventory: GameInventorySnapshot | undefined;
  tf2Features: TF2FeatureSnapshot | undefined;
  tf2ProtocolEntries: ProtocolTraceEntry[];
  dota2Inventory: GameInventorySnapshot | undefined;
  gameInventoryLoading: Record<"steam" | "tf2" | "dota2", boolean>;
  armory: ArmorySnapshot | undefined;
  store: StoreSnapshot | undefined;
  trades: SteamTradesSnapshot | undefined;
  tradeAccounts: SteamAccountTradesCollection | undefined;
  settings: SettingsData | undefined;
  query: string;
  setQuery: (value: string) => void;
  kindFilter: "all" | InventoryItemDto["kind"];
  setKindFilter: (value: "all" | InventoryItemDto["kind"]) => void;
  compactMode: "icons" | "concise" | "detailed";
  setCompactMode: (value: "icons" | "concise" | "detailed") => void;
  receipts: OperationReceipt[] | undefined;
  events: OperationEvent[] | undefined;
  toasts: ToastItem[];
  platform: "desktop" | "web";
  onAddAccount: () => void;
  onSignInAccount: (account: SteamAccountProfile) => void;
  onSignOutAccount: (account: SteamAccountProfile) => void;
  onDeleteAccount: (account: SteamAccountProfile) => void;
  onRefreshInventory: () => void;
  onDismissToast: (id: string) => void;
  onConnect: (input: { username?: string; password?: string }) => Promise<void>;
  onStartSteamQR: () => Promise<void>;
  onSubmitSteamGuard: (input: { code: string }) => Promise<void>;
  onDisconnect: () => Promise<void>;
  onToast: (toast: Omit<ToastItem, "id">) => void;
  onInventoryRefresh: () => void;
  onGameInventoryRefresh: (game: "steam" | "tf2" | "dota2") => void;
  onSteamServiceRefresh: (appId: number) => void;
  onGameOperation: (type: string, input: unknown) => Promise<OperationReceipt>;
  onArmoryRefresh: () => Promise<unknown>;
  onMarketPreview: (marketName: string) => Promise<RelatedItemDto | undefined>;
  onScanPrices: (
    marketNames: string[],
    appId?: number,
  ) => Promise<PriceScanResult | undefined>;
  onArmoryRedeem: (input: ArmoryRedeemRequest) => Promise<OperationReceipt>;
  onStoreRefresh: () => Promise<unknown>;
  onStorePurchase: (
    input: InitializeStorePurchaseRequest,
  ) => Promise<PurchaseSession>;
  onStoreReconcile: (id: string) => Promise<PurchaseSession>;
  onTradesRefresh: (steamId?: string) => Promise<unknown>;
  onInventoryRename: (input: SetItemNameRequest) => Promise<unknown>;
  onRemoveName: (input: RemoveItemNameRequest) => Promise<unknown>;
  onOpenContainer: (
    input: OpenContainerRequest,
    suppressToast?: boolean,
  ) => Promise<unknown>;
  onTerminalSubmit: (
    type: string,
    input?: unknown,
  ) => Promise<OperationReceipt>;
  onStorageSubmit: (type: string, input?: unknown) => Promise<OperationReceipt>;
  onTradeUpSubmit: (type: string, input?: unknown) => Promise<OperationReceipt>;
  onStickerSubmit: (type: string, input?: unknown) => Promise<OperationReceipt>;
  onNameTagApply: (input: SetItemNameRequest) => Promise<OperationReceipt>;
  onNameTagRemove: (input: RemoveItemNameRequest) => Promise<OperationReceipt>;
  onToolApplyStatTrakSwap: (
    input: ApplyStatTrakSwapRequest,
  ) => Promise<OperationReceipt>;
  onToolApplyStrangePart: (
    input: ApplyStrangePartRequest,
  ) => Promise<OperationReceipt>;
  onToolApplyToolToItem: (
    input: ApplyToolToItemRequest,
  ) => Promise<OperationReceipt>;
  onToolApplyToolToBaseItem: (
    input: ApplyToolToBaseItemRequest,
  ) => Promise<OperationReceipt>;
  onItemDelete: (input: DeleteItemRequest) => Promise<OperationReceipt>;
  onItemUse: (input: UseItemRequest) => Promise<OperationReceipt>;
  onItemUseMultiple: (
    input: UseMultipleItemsRequest,
  ) => Promise<OperationReceipt>;
  onItemGift: (input: GiftItemRequest) => Promise<OperationReceipt>;
  onSaveSettings: (next: SettingsData) => Promise<void>;
}

export function AppView(props: AppViewProps) {
  const [rarityFilter, setRarityFilter] = createSignal("all");
  const [weaponFilter, setWeaponFilter] = createSignal("all");
  const [collectionFilter, setCollectionFilter] = createSignal("all");
  const [sort, setSort] = createSignal<InventorySort>("name");
  const [marketPrices, setMarketPrices] = createSignal<
    ReadonlyMap<string, number>
  >(new Map());
  const [economyTagFilter, setEconomyTagFilter] = createSignal("");
  let requestedPriceNames = "";
  const rarityOptions = createMemo(() =>
    [
      ...new Set(
        (props.inventory?.items ?? [])
          .map((item) => item.rarity)
          .filter((value): value is string => !!value),
      ),
    ].sort(),
  );
  const weaponOptions = createMemo(() =>
    [
      ...new Set(
        (props.inventory?.items ?? [])
          .map(itemWeaponName)
          .filter((value): value is string => !!value),
      ),
    ].sort(),
  );
  const collectionOptions = createMemo(() =>
    [
      ...new Set(
        (props.inventory?.items ?? [])
          .map((item) => item.collection)
          .filter((value): value is string => !!value),
      ),
    ].sort(),
  );
  const economyGame = createMemo(() =>
    props.view === "steam-inventory"
      ? ("steam" as const)
      : props.view === "steam-service-inventory"
        ? ("steam-service" as const)
        : props.view === "tf2-inventory"
          ? ("tf2" as const)
          : ("dota2" as const),
  );
  const economySnapshot = createMemo(() =>
    economyGame() === "steam"
      ? props.steamInventory
      : economyGame() === "steam-service"
        ? props.steamServiceInventory
        : economyGame() === "tf2"
          ? props.tf2Inventory
          : props.dota2Inventory,
  );
  const navbarEconomyCategoryOptions = createMemo(() =>
    economyCategoryOptions(economyGame(), economySnapshot()),
  );
  let previousEconomyGame = economyGame();
  createEffect(() => {
    const game = economyGame();
    if (game !== previousEconomyGame) setEconomyTagFilter("");
    previousEconomyGame = game;
  });
  createEffect(() => {
    const names = [
      ...new Set(
        (props.inventory?.items ?? [])
          .map((item) => item.marketName)
          .filter((value): value is string => !!value),
      ),
    ].sort();
    const requestKey = names.join("\u0000");
    if (!requestKey || requestKey === requestedPriceNames) return;
    requestedPriceNames = requestKey;
    const batches = Array.from(
      { length: Math.ceil(names.length / 100) },
      (_, index) => names.slice(index * 100, (index + 1) * 100),
    );
    void Promise.all(batches.map((batch) => props.onScanPrices(batch))).then(
      (results) => {
        const prices = new Map<string, number>();
        for (const result of results) {
          for (const item of result?.items ?? []) {
            const quote = item.quotes.find(
              (candidate) => candidate.source === "steam",
            );
            prices.set(item.marketName, quote?.amountMinor ?? 0);
          }
        }
        setMarketPrices(prices);
      },
    );
  });

  return (
    <main class="flex h-screen min-h-0 flex-col overflow-hidden bg-app text-slate-50">
      <Sidebar
        view={props.view}
        setView={props.setView}
        platform={props.platform}
        health={props.health}
        connection={props.connection}
        accounts={props.accounts}
        inventory={props.inventory}
        settings={props.settings}
        query={props.query}
        setQuery={props.setQuery}
        kindFilter={props.kindFilter}
        setKindFilter={props.setKindFilter}
        rarityFilter={rarityFilter()}
        setRarityFilter={setRarityFilter}
        weaponFilter={weaponFilter()}
        setWeaponFilter={setWeaponFilter}
        collectionFilter={collectionFilter()}
        setCollectionFilter={setCollectionFilter}
        sort={sort()}
        setSort={setSort}
        rarityOptions={rarityOptions()}
        weaponOptions={weaponOptions()}
        collectionOptions={collectionOptions()}
        compactMode={props.compactMode}
        setCompactMode={props.setCompactMode}
        economyTagFilter={economyTagFilter()}
        setEconomyTagFilter={setEconomyTagFilter}
        economyCategoryOptions={navbarEconomyCategoryOptions()}
        onAddAccount={props.onAddAccount}
        onSignInAccount={props.onSignInAccount}
        onSignOutAccount={props.onSignOutAccount}
        onDeleteAccount={props.onDeleteAccount}
        onRefreshInventory={props.onRefreshInventory}
        onRefreshCurrentInventory={() => {
          if (isInventoryScreen(props.view)) return props.onInventoryRefresh();
          if (props.view === "steam-inventory")
            return props.onGameInventoryRefresh("steam");
          if (
            props.view === "steam-service-inventory" &&
            props.steamServiceAppId
          )
            return props.onSteamServiceRefresh(props.steamServiceAppId);
          if (props.view === "tf2-inventory")
            return props.onGameInventoryRefresh("tf2");
          if (props.view === "dota2-inventory")
            return props.onGameInventoryRefresh("dota2");
        }}
        onOpenAccount={() => props.setView("account")}
        onSaveSettings={props.onSaveSettings}
      />

      <section class="flex min-h-0 flex-1 flex-col overflow-hidden p-4 sm:p-6 lg:p-7">
        <Show when={props.statusMessage}>
          <Alert class="mb-5">{props.statusMessage}</Alert>
        </Show>

        <Switch>
          <Match when={props.view === "account"}>
            <AccountView
              connection={props.connection}
              initialUsername={props.accountUsername}
              onConnect={props.onConnect}
              onStartSteamQR={props.onStartSteamQR}
              onSubmitSteamGuard={props.onSubmitSteamGuard}
              onDisconnect={props.onDisconnect}
              onToast={props.onToast}
            />
          </Match>
          <Match when={isInventoryScreen(props.view)}>
            <InventoryView
              mode={isInventoryScreen(props.view) ? props.view : "inventory"}
              inventory={props.inventory}
              loading={props.inventoryLoading}
              selectedItemId={props.selectedItemId}
              setSelectedItemId={props.setSelectedItemId}
              connection={props.connection}
              settings={props.settings}
              query={props.query}
              kindFilter={props.kindFilter}
              rarityFilter={rarityFilter()}
              weaponFilter={weaponFilter()}
              collectionFilter={collectionFilter()}
              sort={sort()}
              marketPrices={marketPrices()}
              compactMode={props.compactMode}
              onMarketPreview={props.onMarketPreview}
            onScanPrices={props.onScanPrices}
              onRename={props.onInventoryRename}
              onRemoveName={props.onRemoveName}
              onOpenContainer={props.onOpenContainer}
              onTerminalPurchase={props.onStorePurchase}
              onLoadTerminalOffer={(terminalId) =>
                props.onTerminalSubmit("terminal.load-offer", { terminalId })
              }
              onLoadStorageContents={(casketId) =>
                props.onStorageSubmit("storage.load", { casketId })
              }
              onMoveFromStorage={(input) =>
                props.onStorageSubmit("storage.move-out", input)
              }
              onToast={props.onToast}
              onRefresh={props.onInventoryRefresh}
            />
          </Match>
          <Match when={isEconomyInventoryScreen(props.view)}>
            <Show when={props.view === "steam-service-inventory"}>
              <section class="mb-3 grid gap-2 rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                <label class="grid max-w-xl gap-1 text-xs text-slate-400">
                  <span>Owned game</span>
                  <select
                    class="h-10 rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={!props.steamServiceGames?.games.length}
                    value={props.steamServiceAppId ?? ""}
                    onInput={(event) =>
                      props.setSteamServiceAppId(
                        event.currentTarget.value
                          ? Number(event.currentTarget.value)
                          : undefined,
                      )
                    }
                  >
                    <option value="" disabled>
                      {props.steamServiceGamesLoading
                        ? "Finding owned games…"
                        : props.steamServiceGames?.status ===
                            "requires_connection"
                          ? "Connect Steam to load games"
                          : props.steamServiceGames?.games.length
                            ? "Choose a game"
                            : "No eligible owned games"}
                    </option>
                    {props.steamServiceGames?.games.map((game) => (
                      <option value={game.appId}>
                        {game.name} — AppID {game.appId}
                      </option>
                    ))}
                  </select>
                </label>
                <p class="max-w-2xl text-xs text-slate-500">
                  {props.steamServiceGames?.message ??
                    "Steam, Dota 2, Team Fortress 2, and Counter-Strike 2 are excluded because they have dedicated inventory implementations. Some other games may not use Steam Inventory Service."}
                </p>
              </section>
            </Show>
            <Show
              when={
                props.view !== "steam-service-inventory" ||
                props.steamServiceAppId
              }
              fallback={
                <div class="rounded-xl border border-dashed border-slate-800 bg-slate-950/40 px-6 py-12 text-center text-sm text-slate-500">
                  {props.steamServiceGamesLoading
                    ? "Finding games owned by the connected Steam account…"
                    : (props.steamServiceGames?.message ??
                      "There is no eligible owned game to inspect.")}
                </div>
              }
            >
              <GameInventoryView
                game={
                  props.view === "steam-inventory"
                    ? "steam"
                    : props.view === "steam-service-inventory"
                      ? "steam-service"
                      : props.view === "tf2-inventory"
                        ? "tf2"
                        : "dota2"
                }
                loading={
                  props.view === "steam-service-inventory"
                    ? false
                    : props.gameInventoryLoading[
                        props.view === "steam-inventory"
                          ? "steam"
                          : props.view === "tf2-inventory"
                            ? "tf2"
                            : "dota2"
                      ]
                }
                connected={
                  props.connection
                    ? props.connection.state === "connected"
                    : undefined
                }
                steamId={
                  props.connection?.state === "connected"
                    ? props.connection.steamId
                    : undefined
                }
                settings={props.settings}
                snapshot={
                  props.view === "steam-inventory"
                    ? props.steamInventory
                    : props.view === "steam-service-inventory"
                      ? props.steamServiceInventory
                      : props.view === "tf2-inventory"
                        ? props.tf2Inventory
                        : props.dota2Inventory
                }
                query={props.query}
                tagFilter={economyTagFilter()}
                selectedAssetId={props.selectedItemId}
                setSelectedAssetId={props.setSelectedItemId}
                compactMode={props.compactMode}
                onScanPrices={props.onScanPrices}
                tf2Features={
                  props.view === "tf2-inventory" ? props.tf2Features : undefined
                }
                protocolEntries={
                  props.view === "tf2-inventory"
                    ? props.tf2ProtocolEntries
                    : undefined
                }
                onRefresh={() =>
                  props.view === "steam-service-inventory"
                    ? props.steamServiceAppId &&
                      props.onSteamServiceRefresh(props.steamServiceAppId)
                    : props.onGameInventoryRefresh(
                        props.view === "steam-inventory"
                          ? "steam"
                          : props.view === "tf2-inventory"
                            ? "tf2"
                            : "dota2",
                      )
                }
                onOperation={props.onGameOperation}
              />
            </Show>
          </Match>
          <Match when={isTF2FeatureScreen(props.view)}>
          <TF2FeaturesView
            snapshot={props.tf2Inventory}
            features={props.tf2Features}
            loading={props.gameInventoryLoading.tf2}
            compactMode={props.compactMode}
            onRefresh={() => props.onGameInventoryRefresh("tf2")}
            onOperation={props.onGameOperation}
          />
          </Match>
          <Match when={props.view === "armory"}>
            <ArmoryView
              armory={props.armory}
              settings={props.settings}
              onRefresh={props.onArmoryRefresh}
              onMarketPreview={props.onMarketPreview}
              onScanPrices={props.onScanPrices}
              onRedeem={props.onArmoryRedeem}
            />
          </Match>
          <Match when={props.view === "store"}>
            <StoreView
              store={props.store}
              settings={props.settings}
              onRefresh={props.onStoreRefresh}
              onPurchase={props.onStorePurchase}
              onReconcile={props.onStoreReconcile}
            />
          </Match>
          <Match when={props.view === "trades"}>
            <TradesView
              snapshot={props.trades}
              accounts={props.tradeAccounts}
              activeSteamId={props.connection?.steamId}
              onRefresh={props.onTradesRefresh}
              onReconnect={() => props.setView("account")}
            />
          </Match>
        </Switch>
      </section>

      <ToastViewport toasts={props.toasts} onDismiss={props.onDismissToast} />
    </main>
  );
}
