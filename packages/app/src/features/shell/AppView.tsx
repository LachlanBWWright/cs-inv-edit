import {
  createEffect,
  createMemo,
  createSignal,
  Match,
  Show,
  Switch,
} from "solid-js";
import { AccountView } from "../accounts/AccountView.js";
import { ArmoryView } from "../armory/ArmoryView.js";
import { StoreView } from "../commerce/StoreView.js";
import { InventoryView } from "../inventory/InventoryView.js";
import { GameInventoryView } from "../inventory/GameInventoryView.js";
import { TF2FeaturesView } from "../tf2/TF2FeaturesView.js";
import type { TF2ActivityFilter } from "../tf2/tf2-activity-utils.js";
import { TF2MatchesView } from "../tf2/TF2MatchesView.js";
import { TF2CampaignsView } from "../tf2/TF2CampaignsView.js";
import {
  CS2FeaturesPanel,
  type CS2ActivityFilter,
} from "../cs2/CS2FeaturesPanel.js";
import { CS2LoadoutsView } from "../cs2/CS2LoadoutsView.js";
import { TradesView } from "../trades/TradesView.js";
import { Sidebar } from "./Sidebar.js";
import { Alert } from "../../shared/ui/Alert.js";
import { ToastViewport } from "../../shared/ui/ToastViewport.js";
import {
  isEconomyInventoryScreen,
  isInventoryScreen,
  isTF2FeatureScreen,
} from "./view.js";
import {
  itemWeaponName,
  type InventorySort,
} from "../inventory/inventory-view-utils.js";
import {
  economyCategoryOptions,
  type EconomyInventorySort,
} from "../inventory/game-inventory-utils.js";
import {
  armoryOfferCategory,
  type CommerceSort,
} from "../commerce/commerce-view-utils.js";
import type { AppViewProps } from "./app-view-props.js";

export function AppView(props: AppViewProps) {
  const [rarityFilter, setRarityFilter] = createSignal("all");
  const [weaponFilter, setWeaponFilter] = createSignal("all");
  const [collectionFilter, setCollectionFilter] = createSignal("all");
  const [sort, setSort] = createSignal<InventorySort>("name");
  const [marketPrices, setMarketPrices] = createSignal<
    ReadonlyMap<string, number>
  >(new Map());
  const [economyTagFilter, setEconomyTagFilter] = createSignal("");
  const [economySort, setEconomySort] =
    createSignal<EconomyInventorySort>("name");
  const [tf2MatchGroup, setTF2MatchGroup] = createSignal(7);
  const [tf2ActivityFilter, setTF2ActivityFilter] =
    createSignal<TF2ActivityFilter>("all");
  const [tf2ActivityLoading, setTF2ActivityLoading] = createSignal<
    "history" | "context"
  >();
  const [tf2ActivityError, setTF2ActivityError] = createSignal("");
  const [cs2ActivityFilter, setCS2ActivityFilter] =
    createSignal<CS2ActivityFilter>("all");
  const [cs2ActivityLoading, setCS2ActivityLoading] = createSignal(false);
  const refreshCS2Activity = async () => {
    setCS2ActivityLoading(true);
    await Promise.all([
      props.onGameOperation("cs2.profile.refresh", { game: "cs2" }, true),
      props.onGameOperation("cs2.matches.recent", { game: "cs2" }, true),
      props.onGameOperation("cs2.progression.refresh", { game: "cs2" }, true),
    ]);
    setCS2ActivityLoading(false);
  };
  let requestedCS2Profile = false;
  createEffect(() => {
    if (props.view !== "cs2-features") {
      requestedCS2Profile = false;
      return;
    }
    if (
      requestedCS2Profile ||
      props.connection?.state !== "connected" ||
      props.cs2Features?.profile
    )
      return;
    requestedCS2Profile = true;
    void props.onGameOperation("cs2.profile.refresh", { game: "cs2" }, true);
  });
  let requestedTF2Activity = false;
  const runTF2ActivityOperation = async (kind: "history" | "context") => {
    setTF2ActivityLoading(kind);
    setTF2ActivityError("");
    const receipt = await props.onGameOperation(
      kind === "history" ? "tf2.matches.load" : "tf2.matches.stats",
      kind === "history"
        ? { game: "tf2", matchGroup: tf2MatchGroup() }
        : { game: "tf2" },
      true,
    );
    setTF2ActivityLoading();
    if (!["completed", "awaiting_gc_confirmation"].includes(receipt.state)) {
      setTF2ActivityError(
        receipt.message || "TF2 could not refresh this activity.",
      );
    }
  };
  createEffect(() => {
    if (props.view !== "tf2-matches") {
      requestedTF2Activity = false;
      return;
    }
    if (
      requestedTF2Activity ||
      props.tf2Inventory?.game !== "tf2" ||
      props.tf2Inventory.status !== "ready"
    )
      return;
    requestedTF2Activity = true;
    void runTF2ActivityOperation("history");
  });
  const [commerceCategoryFilter, setCommerceCategoryFilter] = createSignal("");
  const [commerceSort, setCommerceSort] = createSignal<CommerceSort>("name");
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
  const commerceCategoryOptions = createMemo(() => {
    const values =
      props.view === "armory"
        ? (props.armory?.offers ?? []).map(armoryOfferCategory)
        : props.view === "tf2-store"
          ? (props.tf2Store?.offers ?? []).map((offer) => offer.category)
          : (props.store?.offers ?? []).map((offer) => offer.category);
    return [
      ...new Set(values.filter((value): value is string => !!value)),
    ].sort();
  });
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
    <main class="flex min-h-screen flex-col bg-slate-950 text-slate-50">
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
        economySort={economySort()}
        setEconomySort={setEconomySort}
        steamServiceGames={props.steamServiceGames}
        steamServiceGamesLoading={props.steamServiceGamesLoading}
        steamServiceAppId={props.steamServiceAppId}
        setSteamServiceAppId={props.setSteamServiceAppId}
        commerceCategoryFilter={commerceCategoryFilter()}
        setCommerceCategoryFilter={setCommerceCategoryFilter}
        commerceCategoryOptions={commerceCategoryOptions()}
        commerceSort={commerceSort()}
        setCommerceSort={setCommerceSort}
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
          if (props.view === "armory") return props.onArmoryRefresh();
          if (props.view === "store") return props.onStoreRefresh();
          if (props.view === "tf2-store") return props.onTF2StoreRefresh();
        }}
        onOpenAccount={() => props.setView("account")}
        onSaveSettings={props.onSaveSettings}
        tf2MatchGroup={tf2MatchGroup()}
        setTF2MatchGroup={(value) => {
          setTF2MatchGroup(value);
          void runTF2ActivityOperation("history");
        }}
        tf2ActivityFilter={tf2ActivityFilter()}
        setTF2ActivityFilter={setTF2ActivityFilter}
        tf2ActivityLoading={tf2ActivityLoading()}
        onTF2HistoryRefresh={() => void runTF2ActivityOperation("history")}
        onTF2ContextRefresh={() => void runTF2ActivityOperation("context")}
        onTF2CampaignRefresh={() => props.onGameInventoryRefresh("tf2", true)}
        cs2ActivityFilter={cs2ActivityFilter()}
        setCS2ActivityFilter={setCS2ActivityFilter}
        cs2ActivityLoading={cs2ActivityLoading()}
        onCS2ActivityRefresh={() => void refreshCS2Activity()}
      />

      <section class="flex flex-1 flex-col p-4 sm:p-6 lg:p-7">
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
            />
          </Match>
          <Match when={props.view === "cs2-features"}>
            <CS2FeaturesPanel
              features={props.cs2Features}
              inventory={props.inventory}
              steamId={
                props.connection?.state === "connected"
                  ? props.connection.steamId
                  : undefined
              }
              query={props.query}
              activityFilter={cs2ActivityFilter()}
            />
          </Match>
          <Match when={props.view === "cs2-loadouts"}>
            <CS2LoadoutsView
              features={props.cs2Features}
              inventory={props.inventory}
              featureFlags={props.settings?.featureFlags}
              onRefresh={() => props.onInventoryRefresh(true)}
              onOperation={props.onGameOperation}
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
              onMoveIntoStorage={(input) =>
                props.onStorageSubmit("storage.move-in", input)
              }
              onRefresh={props.onInventoryRefresh}
            />
          </Match>
          <Match when={isEconomyInventoryScreen(props.view)}>
            <Show
              when={
                props.view !== "steam-service-inventory" ||
                props.steamServiceAppId
              }
              fallback={
                <div class="rounded-xl border border-dashed border-slate-800 bg-slate-950 px-6 py-12 text-center text-sm text-slate-500">
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
                sort={economySort()}
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
              onRefresh={() => props.onGameInventoryRefresh("tf2", true)}
              onOperation={props.onGameOperation}
            />
          </Match>
          <Match when={props.view === "tf2-matches"}>
            <TF2MatchesView
              features={props.tf2Features}
              inventory={props.tf2Inventory}
              error={tf2ActivityError()}
              onRefreshInventory={() =>
                props.onGameInventoryRefresh("tf2", true)
              }
            />
          </Match>
          <Match when={props.view === "tf2-campaigns"}>
            <TF2CampaignsView
              features={props.tf2Features}
              inventory={props.tf2Inventory}
              filter={tf2ActivityFilter()}
              onRefreshInventory={() =>
                props.onGameInventoryRefresh("tf2", true)
              }
            />
          </Match>
          <Match when={props.view === "tf2-store"}>
            <StoreView
              store={props.tf2Store}
              settings={props.settings}
              gameName="TF2"
              query={props.query}
              categoryFilter={commerceCategoryFilter()}
              sort={commerceSort()}
              onPurchase={props.onTF2StorePurchase}
              onReconcile={props.onStoreReconcile}
            />
          </Match>
          <Match when={props.view === "armory"}>
            <ArmoryView
              armory={props.armory}
              settings={props.settings}
              query={props.query}
              categoryFilter={commerceCategoryFilter()}
              sort={commerceSort()}
              onMarketPreview={props.onMarketPreview}
              onScanPrices={props.onScanPrices}
              onRedeem={props.onArmoryRedeem}
            />
          </Match>
          <Match when={props.view === "store"}>
            <StoreView
              store={props.store}
              settings={props.settings}
              query={props.query}
              categoryFilter={commerceCategoryFilter()}
              sort={commerceSort()}
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
