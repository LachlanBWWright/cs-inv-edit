import { createEffect, createMemo, createSignal } from "solid-js";
import type {
  EconomyInventoryItemDto,
  PriceScanResult,
} from "@cs-inv-edit/contracts";
import {
  snapshotForGame,
  sortEconomyInventoryItems,
} from "./game-inventory-utils.js";
import {
  steamHostedSaleURL,
  steamInventoryAssetURL,
} from "../commerce/steam-hosted-selling.js";
import {
  randomRevealCandidate,
  type RevealItem,
} from "../../shared/ui/RevealAnimation.js";

import {
  readTF2DismissedActivity,
  writeTF2DismissedActivity,
} from "./game-inventory-elements.js";
import type { GameInventoryViewProps } from "./GameInventoryView.js";

export function createGameInventoryModel(props: GameInventoryViewProps) {
  const [operationStatus, setOperationStatus] = createSignal("");
  const [confirmUseItemId, setConfirmUseItemId] = createSignal<string>();
  const [confirmStrangeResetId, setConfirmStrangeResetId] =
    createSignal<string>();
  const [inspectRequestedAt, setInspectRequestedAt] = createSignal(0);
  const [matchGroup, setMatchGroup] = createSignal(7);
  const [dismissedActivity, setDismissedActivity] = createSignal<string[]>([]);
  const [marketPrices, setMarketPrices] = createSignal<
    ReadonlyMap<string, number>
  >(new Map());
  const [selectedPriceScan, setSelectedPriceScan] =
    createSignal<PriceScanResult>();
  const [selectedPriceScanLoading, setSelectedPriceScanLoading] =
    createSignal(false);
  const [tf2ContainerPreview, setTF2ContainerPreview] = createSignal<{
    candidates: RevealItem[];
    result: RevealItem;
  }>();
  const requestedPriceNames = new Set<string>();
  let priceInventoryKey = "";
  let requestedSelectedPrice = "";
  let requestedTF2Market = false;
  const snapshot = () => snapshotForGame(props.game, props.snapshot);
  const title = () =>
    props.game === "steam"
      ? "Steam Community Inventory"
      : props.game === "steam-service"
        ? `Steam Inventory Service · AppID ${snapshot()?.appId ?? ""}`
        : props.game === "tf2"
          ? "Team Fortress 2 Inventory"
          : "Dota 2 Inventory";
  let loggedDiagnostics = "";
  createEffect(() => {
    const lines = snapshot()?.diagnostics ?? [];
    const key = `${props.game}\u0000${lines.join("\u0000")}`;
    if (lines.length === 0 || loggedDiagnostics === key) return;
    loggedDiagnostics = key;
    console.groupCollapsed(`[${props.game} inventory] metadata diagnostics`);
    for (const line of lines) console.info(line);
    console.groupEnd();
  });
  const items = createMemo(() => {
    const query = props.query.trim().toLowerCase();
    const [filterCategory, filterName] = props.tagFilter.split("\u0000");
    const filtered = (snapshot()?.items ?? []).filter((item) => {
      const queryMatches =
        !query ||
        `${item.name} ${item.marketName ?? ""} ${item.type ?? ""} ${item.rarity ?? ""} ${item.quality ?? ""}`
          .toLowerCase()
          .includes(query);
      const tagMatches =
        !filterCategory ||
        item.tags.some(
          (tag) =>
            tag.category.toLowerCase() === filterCategory &&
            tag.internalName === filterName,
        );
      return queryMatches && tagMatches;
    });
    return sortEconomyInventoryItems(filtered, props.sort, marketPrices());
  });
  const selected = createMemo(
    () =>
      items().find((item) => item.assetId === props.selectedAssetId) ??
      items()[0],
  );
  createEffect(() => {
    const item = selected();
    const marketName = item?.marketName ?? "";
    const requestKey = `${item?.appId ?? 0}\u0000${marketName}`;
    if (!marketName || !item?.marketable) {
      requestedSelectedPrice = "";
      setSelectedPriceScan(undefined);
      setSelectedPriceScanLoading(false);
      return;
    }
    if (requestedSelectedPrice === requestKey) return;
    requestedSelectedPrice = requestKey;
    setSelectedPriceScan(undefined);
    setSelectedPriceScanLoading(true);
    void props.onScanPrices([marketName], item.appId).then((result) => {
      if (requestedSelectedPrice === requestKey) {
        setSelectedPriceScan(result);
        setSelectedPriceScanLoading(false);
      }
    });
  });
  const selectedTF2Details = createMemo(() => {
    const item = selected();
    return item?.game === "tf2" ? item.details : undefined;
  });
  const selectedTF2Item = createMemo(
    (): Extract<EconomyInventoryItemDto, { game: "tf2" }> | undefined => {
      const item = selected();
      return item?.game === "tf2" ? item : undefined;
    },
  );
  const selectedSteamItem = createMemo(
    (): Extract<EconomyInventoryItemDto, { game: "steam" }> | undefined => {
      const item = selected();
      return item?.game === "steam" ? item : undefined;
    },
  );
  const selectedServiceDetails = createMemo(() => {
    const item = selected();
    return item?.game === "steam-service" ? item.details : undefined;
  });
  createEffect(() => {
    if (!props.steamId) {
      setDismissedActivity([]);
      return;
    }
    setDismissedActivity(readTF2DismissedActivity(props.steamId).unwrapOr([]));
  });
  const dismissActivity = (key: string) => {
    const next = [...new Set([...dismissedActivity(), key])];
    setDismissedActivity(next);
    if (props.steamId) {
      writeTF2DismissedActivity({
        steamId: props.steamId,
        ids: next,
      }).unwrapOr(undefined);
    }
  };
  const tf2Activity = createMemo(() =>
    [...(props.tf2Features?.activity ?? [])]
      .slice(-100)
      .reverse()
      .filter(
        (entry) =>
          !dismissedActivity().includes(`${entry.kind}:${entry.id ?? ""}`),
      ),
  );
  const previewTF2Container = () => {
    const details = selectedTF2Details();
    const resolved = (details?.containerItems ?? []).filter(
      (entry) => entry.poolKind !== "unresolved",
    );
    const pictured = resolved.filter((entry) => entry.imageUrl);
    const candidates = (pictured.length > 0 ? pictured : resolved).map(
      (entry) => ({
        name: entry.name,
        rarity: entry.rarity,
        imageUrl: entry.imageUrl,
      }),
    );
    if (candidates.length === 0) return;
    setTF2ContainerPreview({
      candidates,
      result: randomRevealCandidate(candidates, candidates[0]),
    });
  };
  const selectedSaleURL = createMemo(() => {
    const item = selected();
    if (!item?.contextId) return undefined;
    return steamHostedSaleURL({
      steamId: props.steamId,
      appId: item.appId,
      contextId: item.contextId,
      assetId: item.assetId,
      marketable: item.marketable,
    });
  });
  const selectedInventoryURL = createMemo(() => {
    const item = selected();
    if (
      !props.steamId ||
      !item?.contextId ||
      (props.game !== "steam" && props.game !== "tf2")
    )
      return undefined;
    return steamInventoryAssetURL(props.steamId, {
      appId: item.appId,
      contextId: item.contextId,
      assetId: item.assetId,
    });
  });
  const submitTF2Operation = async (type: string, input: unknown) => {
    if (!props.onOperation) return;
    setOperationStatus("Submitting…");
    const receipt = await props.onOperation(type, input);
    setOperationStatus(receipt.message ?? receipt.state);
    return receipt;
  };
  const resolveTF2Inspect = async (inspectUrl: string) => {
    setInspectRequestedAt(Date.now());
    const receipt = await submitTF2Operation("tf2.inspect.resolve", {
      game: "tf2",
      inspectUrl,
    });
    if (
      receipt &&
      !["awaiting_gc_confirmation", "completed"].includes(receipt.state)
    ) {
      setInspectRequestedAt(0);
    }
  };
  createEffect(() => {
    if (
      props.game !== "tf2" ||
      requestedTF2Market ||
      !props.onOperation ||
      props.connected !== true
    ) {
      return;
    }
    requestedTF2Market = true;
    void submitTF2Operation("tf2.market.refresh", { game: "tf2" });
  });
  const selectedTF2Market = createMemo(() => {
    const item = selectedTF2Item();
    if (!item?.definitionId) return undefined;
    return props.tf2Features?.market.find(
      (entry) =>
        entry.definitionId === item.definitionId &&
        entry.qualityId === item.details.qualityId,
    );
  });
  const selectedTF2MarketPrice = createMemo(() => {
    const market = selectedTF2Market();
    if (!market) return "";
    const currency = props.tf2Features?.currency;
    if (!currency)
      return `${(market.priceMinor / 100).toFixed(2)} local currency`;
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
    }).format(market.priceMinor / 100);
  });
  const inspectedTF2Item = createMemo(() => {
    const resolvedAt = Date.parse(props.tf2Features?.inspectedAt ?? "");
    if (
      inspectRequestedAt() > 0 &&
      (!Number.isFinite(resolvedAt) || resolvedAt < inspectRequestedAt())
    ) {
      return undefined;
    }
    return props.tf2Features?.inspectedItem;
  });
  createEffect(() => {
    const current = snapshot();
    const inventoryKey = `${current?.appId ?? 0}\u0000${current?.refreshedAt ?? ""}`;
    if (priceInventoryKey !== inventoryKey) {
      priceInventoryKey = inventoryKey;
      requestedPriceNames.clear();
      setMarketPrices(new Map());
    }
    const names = [
      ...new Set(
        items()
          .filter((item) => item.marketable)
          .map((item) => item.marketName)
          .filter(
            (value): value is string =>
              !!value && !requestedPriceNames.has(value),
          ),
      ),
    ];
    if (names.length === 0) return;
    for (const name of names) requestedPriceNames.add(name);
    void props.onScanPrices(names, current?.appId).then((result) => {
      if (!result || priceInventoryKey !== inventoryKey) return;
      setMarketPrices((existing) => {
        const prices = new Map(existing);
        for (const entry of result.items)
          prices.set(
            entry.marketName,
            entry.quotes.find((quote) => quote.source === "steam")
              ?.amountMinor ?? 0,
          );
        return prices;
      });
    });
  });
  return {
    operationStatus,
    confirmUseItemId,
    setConfirmUseItemId,
    confirmStrangeResetId,
    setConfirmStrangeResetId,
    inspectRequestedAt,
    matchGroup,
    setMatchGroup,
    marketPrices,
    selectedPriceScan,
    selectedPriceScanLoading,
    tf2ContainerPreview,
    setTF2ContainerPreview,
    snapshot,
    title,
    items,
    selected,
    selectedTF2Details,
    selectedTF2Item,
    selectedSteamItem,
    selectedServiceDetails,
    dismissActivity,
    tf2Activity,
    previewTF2Container,
    selectedSaleURL,
    selectedInventoryURL,
    submitTF2Operation,
    resolveTF2Inspect,
    selectedTF2Market,
    selectedTF2MarketPrice,
    inspectedTF2Item,
  };
}
