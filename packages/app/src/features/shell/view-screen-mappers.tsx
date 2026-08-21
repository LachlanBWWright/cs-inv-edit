import { Match, Show, Switch } from "solid-js";
import { AccountView } from "../accounts/AccountView.js";
import { ArmoryView } from "../armory/ArmoryView.js";
import { StoreView } from "../commerce/StoreView.js";
import { InventoryView } from "../inventory/InventoryView.js";
import { GameInventoryView } from "../inventory/GameInventoryView.js";
import { TF2FeaturesView } from "../tf2/TF2FeaturesView.js";
import { TF2MatchesView } from "../tf2/TF2MatchesView.js";
import { TF2CampaignsView } from "../tf2/TF2CampaignsView.js";
import type { TF2ActivityFilter } from "../tf2/tf2-activity-utils.js";
import {
  CS2FeaturesPanel,
  type CS2ActivityFilter,
} from "../cs2/CS2FeaturesPanel.js";
import { CS2LoadoutsView } from "../cs2/CS2LoadoutsView.js";
import { TradesView } from "../trades/TradesView.js";
import { Alert } from "../../shared/ui/Alert.js";
import { ToastViewport } from "../../shared/ui/ToastViewport.js";
import type { CommerceSort } from "../commerce/commerce-view-utils.js";
import type { InventorySort } from "../inventory/inventory-view-utils.js";
import type { EconomyInventorySort } from "../inventory/game-inventory-utils.js";
import {
  isEconomyInventoryScreen,
  isInventoryScreen,
  isTF2FeatureScreen,
} from "./view.js";
import type { AppViewProps } from "./app-view-props.js";
import type { EconomyGame } from "../../shared/ui-types.js";

interface ViewScreenMapperProps extends AppViewProps {
  rarityFilter: string | undefined;
  weaponFilter: string | undefined;
  collectionFilter: string | undefined;
  sort: InventorySort;
  marketPrices: ReadonlyMap<string, number>;
  economyTagFilter: string | undefined;
  economySort: EconomyInventorySort;
  tf2ActivityFilter: TF2ActivityFilter;
  cs2ActivityFilter: CS2ActivityFilter;
  commerceCategoryFilter: string | undefined;
  commerceSort: CommerceSort;
}

function InventoryScreenView(props: ViewScreenMapperProps) {
  return (
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
      rarityFilter={props.rarityFilter ?? ""}
      weaponFilter={props.weaponFilter ?? ""}
      collectionFilter={props.collectionFilter ?? ""}
      sort={props.sort}
      marketPrices={props.marketPrices}
      compactMode={props.compactMode}
      marketActions={{
        preview: props.onMarketPreview,
        scanPrices: props.onScanPrices,
      }}
      renameActions={{
        rename: props.onInventoryRename,
        removeName: props.onRemoveName,
      }}
      containerActions={{
        open: props.onOpenContainer,
        purchaseTerminal: props.onStorePurchase,
        loadTerminalOffer: props.onLoadTerminalOffer,
      }}
      storageActions={{
        loadContents: props.onLoadStorageContents,
        moveFrom: props.onMoveFromStorage,
        moveInto: props.onMoveIntoStorage,
      }}
      tradeUpActions={{ execute: props.onExecuteTradeUp }}
      onRefresh={props.onInventoryRefresh}
    />
  );
}

function economyGameForView(view: AppViewProps["view"]) {
  switch (view) {
    case "steam-inventory":
      return "steam" as const;
    case "steam-service-inventory":
      return "steam-service" as const;
    case "tf2-inventory":
      return "tf2" as const;
    default:
      return "dota2" as const;
  }
}

function gameInventoryForView(props: ViewScreenMapperProps) {
  switch (props.view) {
    case "steam-inventory":
      return props.steamInventory;
    case "steam-service-inventory":
      return props.steamServiceInventory;
    case "tf2-inventory":
      return props.tf2Inventory;
    default:
      return props.dota2Inventory;
  }
}

function refreshGameForView(view: AppViewProps["view"]): EconomyGame {
  if (view === "steam-inventory") return "steam";
  if (view === "tf2-inventory") return "tf2";
  return "dota2";
}

function gameInventoryLoading(props: ViewScreenMapperProps) {
  if (props.view === "steam-service-inventory") return false;
  return props.gameInventoryLoading[refreshGameForView(props.view)];
}

function refreshGameInventory(props: ViewScreenMapperProps) {
  if (props.view === "steam-service-inventory") {
    if (props.steamServiceAppId)
      props.onSteamServiceRefresh(props.steamServiceAppId);
    return;
  }
  props.onGameInventoryRefresh(refreshGameForView(props.view));
}

function EconomyScreenView(props: ViewScreenMapperProps) {
  return (
    <Show
      when={props.view !== "steam-service-inventory" || props.steamServiceAppId}
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
        game={economyGameForView(props.view)}
        loading={gameInventoryLoading(props)}
        connected={
          props.connection ? props.connection.state === "connected" : undefined
        }
        steamId={
          props.connection?.state === "connected"
            ? props.connection.steamId
            : undefined
        }
        settings={props.settings}
        snapshot={gameInventoryForView(props)}
        query={props.query}
        tagFilter={props.economyTagFilter ?? ""}
        selectedAssetId={props.selectedItemId}
        setSelectedAssetId={props.setSelectedItemId}
        compactMode={props.compactMode}
        sort={props.economySort}
        onScanPrices={props.onScanPrices}
        tf2Features={
          props.view === "tf2-inventory" ? props.tf2Features : undefined
        }
        protocolEntries={
          props.view === "tf2-inventory" ? props.tf2ProtocolEntries : undefined
        }
        onRefresh={() => refreshGameInventory(props)}
        onOperation={props.onGameOperation}
      />
    </Show>
  );
}

function ScreenContent(props: ViewScreenMapperProps) {
  return (
    <Switch>
      <Match when={props.view === "account"}>
        <AccountView
          connection={props.connection}
          initialUsername={props.accountUsername}
          loginOnly={props.accountLoginOnly}
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
          activityFilter={props.cs2ActivityFilter}
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
        <InventoryScreenView {...props} />
      </Match>
      <Match when={isEconomyInventoryScreen(props.view)}>
        <EconomyScreenView {...props} />
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
          onRefreshInventory={() => props.onGameInventoryRefresh("tf2", true)}
        />
      </Match>
      <Match when={props.view === "tf2-campaigns"}>
        <TF2CampaignsView
          features={props.tf2Features}
          inventory={props.tf2Inventory}
          filter={props.tf2ActivityFilter}
          onRefreshInventory={() => props.onGameInventoryRefresh("tf2", true)}
        />
      </Match>
      <Match when={props.view === "tf2-store"}>
        <StoreView
          store={props.tf2Store}
          settings={props.settings}
          gameName="TF2"
          query={props.query}
          categoryFilter={props.commerceCategoryFilter}
          sort={props.commerceSort}
          onPurchase={props.onTF2StorePurchase}
          onReconcile={props.onStoreReconcile}
        />
      </Match>
      <Match when={props.view === "armory"}>
        <ArmoryView
          armory={props.armory}
          settings={props.settings}
          query={props.query}
          categoryFilter={props.commerceCategoryFilter}
          sort={props.commerceSort}
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
          categoryFilter={props.commerceCategoryFilter}
          sort={props.commerceSort}
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
  );
}

export function ViewScreenMapper(props: ViewScreenMapperProps) {
  return (
    <>
      <section class="flex flex-1 flex-col p-4 sm:p-6 lg:p-7">
        <Show when={props.statusMessage}>
          <Alert class="mb-5">{props.statusMessage}</Alert>
        </Show>

        <ScreenContent {...props} />
      </section>

      <ToastViewport toasts={props.toasts} onDismiss={props.onDismissToast} />
    </>
  );
}
