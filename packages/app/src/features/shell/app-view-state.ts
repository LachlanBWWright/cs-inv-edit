import { createEffect, createMemo, createSignal } from "solid-js";
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
import type { TF2ActivityFilter } from "../tf2/tf2-activity-utils.js";
import type { CS2ActivityFilter } from "../cs2/CS2FeaturesPanel.js";
import type { AppViewProps } from "./app-view-props.js";

export function createAppViewState(props: AppViewProps) {
  const [rarityFilter, setRarityFilter] = createSignal("all");
  const [weaponFilter, setWeaponFilter] = createSignal("all");
  const [collectionFilter, setCollectionFilter] = createSignal("all");
  const [sort, setSort] = createSignal<InventorySort>("name");
  const [marketPrices, setMarketPrices] = createSignal<
    ReadonlyMap<string, number>
  >(new Map());
  const steamPrice = (item: {
    quotes: Array<{ source: string; amountMinor?: number }>;
  }) => item.quotes.find((quote) => quote.source === "steam")?.amountMinor ?? 0;
  const [economyTagFilter, setEconomyTagFilter] = createSignal("");
  const [economySort, setEconomySort] =
    createSignal<EconomyInventorySort>("name");
  const [tf2MatchGroup, setTF2MatchGroup] = createSignal(7);
  const [tf2ActivityFilter, setTF2ActivityFilter] =
    createSignal<TF2ActivityFilter>("all");
  const [tf2ActivityLoading, setTF2ActivityLoading] =
    createSignal<import("../../shared/ui-types.js").TF2ActivityLoading>();
  const [tf2ActivityError, setTF2ActivityError] = createSignal("");
  const [cs2ActivityFilter, setCS2ActivityFilter] =
    createSignal<CS2ActivityFilter>("all");
  const [cs2ActivityLoading, setCS2ActivityLoading] = createSignal(false);
  const [commerceCategoryFilter, setCommerceCategoryFilter] = createSignal("");
  const [commerceSort, setCommerceSort] = createSignal<CommerceSort>("name");

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
  const runTF2ActivityOperation = async (
    kind: import("../../shared/ui-types.js").TF2ActivityLoading,
  ) => {
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
    if (!["completed", "awaiting_gc_confirmation"].includes(receipt.state))
      setTF2ActivityError(
        receipt.message || "TF2 could not refresh this activity.",
      );
  };
  let requestedTF2Activity = false;
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
  let requestedPriceNames = "";
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
        for (const result of results)
          for (const item of result?.items ?? [])
            prices.set(item.marketName, steamPrice(item));
        setMarketPrices(prices);
      },
    );
  });

  return {
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
    tf2ActivityError,
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
  };
}
