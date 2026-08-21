import { Sidebar } from "./Sidebar.js";
import { ViewScreenMapper } from "./view-screen-mappers.js";
import type { AppViewProps } from "./app-view-props.js";
import { createAppViewState } from "./app-view-state.js";
import { isInventoryScreen } from "./view.js";

export function AppView(props: AppViewProps) {
  const {
    rarityFilter,
    setRarityFilter,
    weaponFilter,
    setWeaponFilter,
    collectionFilter,
    setCollectionFilter,
    sort,
    setSort,
    marketPrices,
    economyTagFilter,
    setEconomyTagFilter,
    economySort,
    setEconomySort,
    tf2MatchGroup,
    setTF2MatchGroup,
    tf2ActivityFilter,
    setTF2ActivityFilter,
    tf2ActivityLoading,
    cs2ActivityFilter,
    setCS2ActivityFilter,
    cs2ActivityLoading,
    commerceCategoryFilter,
    setCommerceCategoryFilter,
    commerceSort,
    setCommerceSort,
    rarityOptions,
    weaponOptions,
    collectionOptions,
    navbarEconomyCategoryOptions,
    commerceCategoryOptions,
    refreshCS2Activity,
    runTF2ActivityOperation,
  } = createAppViewState(props);

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

      <ViewScreenMapper
        {...props}
        rarityFilter={rarityFilter()}
        weaponFilter={weaponFilter()}
        collectionFilter={collectionFilter()}
        sort={sort()}
        marketPrices={marketPrices()}
        economyTagFilter={economyTagFilter()}
        economySort={economySort()}
        tf2ActivityFilter={tf2ActivityFilter()}
        cs2ActivityFilter={cs2ActivityFilter()}
        commerceCategoryFilter={commerceCategoryFilter()}
        commerceSort={commerceSort()}
      />
    </main>
  );
}
