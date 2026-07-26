import {
  For,
  Show,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
} from "solid-js";
import { fromThrowable } from "neverthrow";
import type {
  EconomyInventorySource,
  EconomyInventoryItemDto,
  GameInventorySnapshot,
  OperationReceipt,
  PriceScanResult,
  ProtocolTraceEntry,
  SettingsData,
  TF2FeatureSnapshot,
} from "@cs-inv-edit/contracts";
import { Alert } from "./ui/Alert.js";
import { InventoryLoadingState } from "./ui/InventoryLoadingState.js";
import type { LoadingStage } from "./ui/LoadingProgress.js";
import { PullToRefresh } from "./ui/PullToRefresh.js";
import {
  calculateVirtualInventoryWindow,
  economyOutlineClass,
  snapshotForGame,
  virtualInventoryWindowChanged,
} from "./game-inventory-utils.js";
import {
  ItemMarketBadges,
  marketPriceLabel,
  tradeStateDescription,
} from "./ItemMarketBadges.js";
import {
  steamHostedSaleURL,
  steamInventoryAssetURL,
} from "./steam-hosted-selling.js";
import { VendorPricePreview } from "./VendorPricePreview.js";
import { TF2StrangeWorkshop } from "./TF2StrangeWorkshop.js";

const readTF2DismissedActivity = fromThrowable(
  (steamId: string): string[] =>
    JSON.parse(
      globalThis.localStorage.getItem(`tf2.activity.dismissed.${steamId}`) ??
        "[]",
    ),
  () => [] as string[],
);
const writeTF2DismissedActivity = fromThrowable(
  (input: { steamId: string; ids: string[] }) =>
    globalThis.localStorage.setItem(
      `tf2.activity.dismissed.${input.steamId}`,
      JSON.stringify(input.ids),
    ),
  () => undefined,
);
import {
  RevealAnimation,
  randomRevealCandidate,
  type RevealItem,
} from "./ui/RevealAnimation.js";
import { ItemPreviewMedia } from "./ItemPreviewMedia.js";

const economyInventoryLoadingStages: Record<
  EconomyInventorySource,
  readonly LoadingStage[]
> = {
  steam: [
    {
      afterSeconds: 0,
      label: "Contacting Steam inventory services",
      detail: "Requesting the owned-item inventory for this Steam account.",
    },
    {
      afterSeconds: 8,
      label: "Waiting for inventory data",
      detail:
        "Steam may take several seconds to return the complete inventory snapshot.",
    },
    {
      afterSeconds: 20,
      label: "Resolving current item metadata",
      detail:
        "Matching item descriptions, names, tags, and available image tokens.",
    },
    {
      afterSeconds: 45,
      label: "Still working—Steam is responding slowly",
      detail:
        "The request remains active while bounded metadata lookups finish.",
    },
  ],
  "steam-service": [
    {
      afterSeconds: 0,
      label: "Contacting Steam Inventory Service",
      detail:
        "Requesting AppID-scoped owned items through the authenticated Steam session.",
    },
    {
      afterSeconds: 8,
      label: "Waiting for Inventory.GetInventory",
      detail: "Steam is preparing item instances and definition metadata.",
    },
    {
      afterSeconds: 20,
      label: "Decoding item definitions",
      detail:
        "Normalizing names, quantities, state, origins, tags, and dynamic properties.",
    },
    {
      afterSeconds: 30,
      label: "Still working—Steam is responding slowly",
      detail:
        "The request remains bounded and will not be retried as a mutation.",
    },
  ],
  tf2: [
    {
      afterSeconds: 0,
      label: "Contacting the TF2 Game Coordinator",
      detail:
        "Requesting the authoritative owned-item SOCache for this Steam account.",
    },
    {
      afterSeconds: 8,
      label: "Waiting for TF2 inventory data",
      detail:
        "The Game Coordinator can take several retries before it sends the inventory snapshot.",
    },
    {
      afterSeconds: 20,
      label: "Resolving current TF2 item metadata",
      detail:
        "Matching schema definitions, localized names, qualities, classes, and equip slots.",
    },
    {
      afterSeconds: 45,
      label: "Still working—Steam is responding slowly",
      detail:
        "The request remains active while bounded metadata lookups finish.",
    },
  ],
  dota2: [
    {
      afterSeconds: 0,
      label: "Contacting the Dota 2 Game Coordinator",
      detail:
        "Requesting the authoritative owned-item SOCache for this Steam account.",
    },
    {
      afterSeconds: 8,
      label: "Waiting for Dota 2 inventory data",
      detail:
        "The Game Coordinator can take several retries before it sends the inventory snapshot.",
    },
    {
      afterSeconds: 20,
      label: "Resolving current Dota 2 item metadata",
      detail:
        "Matching item names, rarities, heroes, slots, and available images.",
    },
    {
      afterSeconds: 45,
      label: "Still working—Steam is responding slowly",
      detail:
        "The request remains active while bounded metadata lookups finish.",
    },
  ],
};

function marketURL(item: EconomyInventoryItemDto) {
  return `https://steamcommunity.com/market/listings/${item.appId}/${encodeURIComponent(item.marketName ?? "")}`;
}

function ItemImage(props: { item: EconomyInventoryItemDto; large?: boolean }) {
  return (
    <ItemPreviewMedia
      name={props.item.name}
      imageUrl={props.item.imageUrl}
      variant={props.large ? "details" : "economy-card"}
    />
  );
}

function TF2ItemDiagnostics(props: {
  item: Extract<EconomyInventoryItemDto, { game: "tf2" }>;
}) {
  const details = () => props.item.details;
  return (
    <details class="rounded-2xl border border-slate-800/80 p-3 text-sm text-slate-400">
      <summary class="cursor-pointer font-medium text-slate-200">
        Item diagnostics
      </summary>
      <div class="mt-3 space-y-3">
        <div class="grid gap-1 font-mono text-xs">
          <p>GC item ID: {props.item.assetId}</p>
          <p>Definition index: {props.item.definitionId ?? "unknown"}</p>
          <p>Inventory position: {details().inventoryPosition}</p>
          <p>Quality ID: {details().qualityId}</p>
          <p>Origin ID: {details().originId}</p>
          <p>Flags: {details().flags}</p>
        </div>
        <Show when={details().decodedAttributes?.length}>
          <section class="border-t border-slate-800 pt-3">
            <h4 class="font-medium text-slate-200">Decoded attributes</h4>
            <dl class="mt-2 space-y-2">
              <For each={details().decodedAttributes}>
                {(attribute) => (
                  <div class="grid grid-cols-[minmax(0,1fr)_auto] gap-3">
                    <dt>
                      <span class="text-slate-200">{attribute.name}</span>
                      <span class="ml-1 font-mono text-[10px] text-slate-600">
                        #{attribute.defIndex}
                      </span>
                      <Show when={attribute.hidden}>
                        <span class="ml-1 text-[10px] uppercase text-slate-600">
                          hidden
                        </span>
                      </Show>
                    </dt>
                    <dd class="max-w-64 break-words text-right font-medium text-cyan-100">
                      {attribute.value}
                    </dd>
                  </div>
                )}
              </For>
            </dl>
          </section>
        </Show>
        <details class="border-t border-slate-800 pt-3">
          <summary class="cursor-pointer text-xs font-medium text-slate-400">
            Raw GC attribute payloads
          </summary>
          <div class="mt-2 grid gap-3 font-mono text-xs">
            <Show when={Object.keys(details().attributes).length}>
              <div>
                <p class="mb-1 text-slate-500">32-bit values</p>
                <For each={Object.entries(details().attributes)}>
                  {([id, value]) => (
                    <p class="flex justify-between gap-3">
                      <span>{id}</span>
                      <span>{value}</span>
                    </p>
                  )}
                </For>
              </div>
            </Show>
            <Show when={Object.keys(details().attributeBytes ?? {}).length}>
              <div>
                <p class="mb-1 text-slate-500">Binary values</p>
                <For each={Object.entries(details().attributeBytes ?? {})}>
                  {([id, value]) => (
                    <p class="grid grid-cols-[auto_1fr] gap-3">
                      <span>{id}</span>
                      <span class="break-all text-right">{value}</span>
                    </p>
                  )}
                </For>
              </div>
            </Show>
          </div>
        </details>
      </div>
    </details>
  );
}

function SteamItemDiagnostics(props: {
  item: Extract<EconomyInventoryItemDto, { game: "steam" }>;
  priceScan?: PriceScanResult;
  priceScanLoading: boolean;
}) {
  const quotes = () =>
    props.priceScan?.items.find(
      (entry) => entry.marketName === props.item.marketName,
    )?.quotes ?? [];
  return (
    <details class="rounded-2xl border border-slate-800/80 p-3 text-sm text-slate-400">
      <summary class="cursor-pointer font-medium text-slate-200">
        Item diagnostics
      </summary>
      <div class="mt-3 space-y-3">
        <div class="grid gap-1 font-mono text-xs">
          <p>App ID: {props.item.appId}</p>
          <p>Context ID: {props.item.contextId ?? "unknown"}</p>
          <p>Asset ID: {props.item.assetId}</p>
          <p>Class ID: {props.item.classId ?? "unknown"}</p>
          <p>Instance ID: {props.item.instanceId ?? "unknown"}</p>
          <p>Market hash name: {props.item.marketName ?? "missing"}</p>
          <p>Marketable: {String(props.item.marketable)}</p>
          <p>Tradable: {String(props.item.tradable)}</p>
        </div>
        <section class="border-t border-slate-800 pt-3">
          <h4 class="font-medium text-slate-200">Steam Market lookup</h4>
          <Show when={props.priceScanLoading}>
            <p class="mt-2 text-sky-300">Request in progress…</p>
          </Show>
          <Show when={!props.priceScanLoading && !props.item.marketName}>
            <p class="mt-2 text-amber-300">
              No market hash name was supplied by the Steam item description.
            </p>
          </Show>
          <Show
            when={
              !props.priceScanLoading &&
              props.item.marketName &&
              !props.item.marketable
            }
          >
            <p class="mt-2 text-slate-500">
              Lookup skipped because Steam marks this item as non-marketable.
            </p>
          </Show>
          <Show when={props.priceScan?.scannedAt}>
            <p class="mt-2 font-mono text-xs">
              Scanned: {props.priceScan?.scannedAt}
            </p>
          </Show>
          <For each={quotes()}>
            {(quote) => (
              <p class="mt-2 text-xs">
                <span class="text-slate-200">{quote.source}</span>:{" "}
                {quote.displayPrice || "no display price"}
                <Show when={quote.listingCount !== undefined}>
                  {" "}
                  · {quote.listingCount} listings
                </Show>
              </p>
            )}
          </For>
          <For each={props.priceScan?.errors ?? []}>
            {(error) => (
              <p class="mt-2 break-words text-xs text-amber-300">
                {error.source}: {error.message}
              </p>
            )}
          </For>
          <Show
            when={
              !props.priceScanLoading &&
              props.priceScan &&
              quotes().length === 0 &&
              props.priceScan.errors.length === 0
            }
          >
            <p class="mt-2 text-xs text-slate-500">
              Steam returned no active listing for this exact market hash name.
            </p>
          </Show>
        </section>
      </div>
    </details>
  );
}

export function GameInventoryView(props: {
  game: EconomyInventorySource;
  loading: boolean;
  snapshot?: GameInventorySnapshot;
  connected?: boolean;
  steamId?: string;
  settings?: SettingsData;
  query: string;
  tagFilter: string;
  selectedAssetId?: string;
  setSelectedAssetId: (id: string | undefined) => void;
  compactMode: "icons" | "concise" | "detailed";
  onRefresh: () => void;
  onScanPrices: (
    marketNames: string[],
    appId?: number,
  ) => Promise<PriceScanResult | undefined>;
  onOperation?: (type: string, input: unknown) => Promise<OperationReceipt>;
  tf2Features?: TF2FeatureSnapshot;
  protocolEntries?: ProtocolTraceEntry[];
}) {
  const [scrollTop, setScrollTop] = createSignal(0);
  const [viewport, setViewport] = createSignal({ width: 800, height: 600 });
  const [operationStatus, setOperationStatus] = createSignal("");
  const [confirmUseItemId, setConfirmUseItemId] = createSignal<string>();
  const [confirmStrangeResetId, setConfirmStrangeResetId] = createSignal<string>();
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
  let gridViewport: HTMLDivElement | undefined;
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
    return (snapshot()?.items ?? []).filter((item) => {
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
    setDismissedActivity(
      readTF2DismissedActivity(props.steamId).unwrapOr([]),
    );
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
    if (receipt && !["awaiting_gc_confirmation", "completed"].includes(receipt.state)) {
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
    if (!currency) return `${(market.priceMinor / 100).toFixed(2)} local currency`;
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
  const virtualGrid = createMemo(() => {
    const window = calculateVirtualInventoryWindow(
      items().length,
      viewport().width,
      viewport().height,
      scrollTop(),
      props.compactMode,
    );
    return {
      ...window,
      visibleItems: items().slice(window.firstItem, window.lastItem),
    };
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
        virtualGrid()
          .visibleItems.filter((item) => item.marketable)
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
  const handleInventoryScroll = (nextScrollTop: number) => {
    if (
      virtualInventoryWindowChanged(
        items().length,
        viewport().width,
        viewport().height,
        scrollTop(),
        nextScrollTop,
        props.compactMode,
      )
    )
      setScrollTop(nextScrollTop);
  };
  onMount(() => {
    if (!gridViewport) return;
    const update = () =>
      setViewport({
        width: gridViewport?.clientWidth ?? 800,
        height: gridViewport?.clientHeight ?? 600,
      });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(gridViewport);
    onCleanup(() => observer.disconnect());
  });

  return (
    <div class="flex min-h-0 flex-1 flex-col gap-4">
      <Show
        when={
          snapshot()?.status === "requires_connection" &&
          props.connected === false
        }
      >
        <Alert variant="warning">
          Connect a Steam account, then refresh this inventory.
        </Alert>
      </Show>
      <Show when={snapshot()?.status === "error"}>
        <Alert variant="danger">
          {snapshot()?.error || "Inventory loading failed"}
        </Alert>
      </Show>
      <Show when={props.game === "tf2"}>
        <details class="rounded-xl border border-slate-800 bg-slate-900">
          <summary class="cursor-pointer px-4 py-3 text-sm font-medium text-slate-200">Activity and progression <span class="ml-1 text-xs font-normal text-slate-500">matches, contracts, notifications, and XP</span></summary>
          <div class="border-t border-slate-800 p-4">
            <div class="flex flex-wrap items-end gap-2">
              <label class="grid gap-1 text-xs text-slate-400"><span>Match history</span><select class="h-9 rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-200" value={matchGroup()} onInput={(event) => setMatchGroup(Number(event.currentTarget.value))}><option value="7">Casual 12v12</option><option value="6">Casual 9v9</option><option value="5">Casual 6v6</option><option value="4">Competitive 12v12</option><option value="3">Competitive 9v9</option><option value="2">Competitive 6v6</option><option value="1">Mann Up</option><option value="0">MvM Practice</option></select></label>
              <button class="h-9 rounded-lg border border-slate-700 bg-slate-800 px-3 text-sm text-slate-200 hover:bg-slate-700" onClick={() => void submitTF2Operation("tf2.matches.load", { game: "tf2", matchGroup: matchGroup() })}>Load history</button>
              <button class="h-9 rounded-lg border border-slate-700 bg-slate-800 px-3 text-sm text-slate-200 hover:bg-slate-700" onClick={() => void submitTF2Operation("tf2.matches.stats", { game: "tf2" })}>Refresh matchmaking context</button>
            </div>
            <Show when={tf2Activity().length > 0 || (props.tf2Features?.matches.length ?? 0) > 0 || (props.tf2Features?.quests.length ?? 0) > 0 || (props.tf2Features?.questNodes.length ?? 0) > 0 || (props.tf2Features?.questRewards.length ?? 0) > 0} fallback={<p class="mt-4 text-sm text-slate-500">No match, contract, notification, or XP activity has arrived from the TF2 Game Coordinator in this session.</p>}>
              <div class="mt-4 grid gap-2 sm:grid-cols-2">
                <For each={props.tf2Features?.matches ?? []}>{(entry) =>
                  <div class="rounded-lg border border-slate-800 bg-slate-950 p-3">
                    <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Match result</p>
                    <p class="mt-1 text-sm text-slate-200">Match {String(entry.match_id ?? entry.matchId ?? "recorded")}</p>
                    <p class="mt-1 text-xs text-slate-500">
                      Map {String(entry.map_index ?? "unavailable")} · group {String(entry.match_group ?? "unavailable")} · season {String(entry.season_id ?? "unavailable")}
                    </p>
                    <dl class="mt-3 grid grid-cols-3 gap-2 text-xs">
                      <For each={[
                        ["Score", entry.score],
                        ["Kills", entry.kills],
                        ["Deaths", entry.deaths],
                        ["Damage", entry.damage],
                        ["Healing", entry.healing],
                        ["Support", entry.support],
                        ["Rating", entry.display_rating],
                        ["Change", entry.display_rating_change],
                        ["Party", entry.original_party_id],
                      ] as const}>
                        {([label, value]) => <div><dt class="text-slate-600">{label}</dt><dd class="text-slate-300">{value === undefined ? "Unavailable" : String(value)}</dd></div>}
                      </For>
                    </dl>
                  </div>
                }</For>
                <For each={props.tf2Features?.quests ?? []}>{(entry) =>
                  <div class="rounded-lg border border-slate-800 bg-slate-950 p-3">
                    <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Contract</p>
                    <p class="mt-1 text-sm text-slate-200">Quest {String(entry.quest_id ?? entry.questId ?? entry.id ?? "active")}</p>
                    <p class="mt-1 text-xs text-slate-500">
                      {entry.active === false ? "Completed or inactive" : "Active"}
                      {" · "}objectives {String(entry.points_0 ?? "—")} / {String(entry.points_1 ?? "—")} / {String(entry.points_2 ?? "—")}
                    </p>
                  </div>
                }</For>
                <For each={props.tf2Features?.questNodes ?? []}>{(entry) =>
                  <div class="rounded-lg border border-slate-800 bg-slate-950 p-3">
                    <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Quest-map node</p>
                    <p class="mt-1 text-sm text-slate-200">Node {String(entry.node_id ?? entry.defindex ?? "available")}</p>
                    <p class="mt-1 text-xs text-slate-500">
                      Stars {[entry.star_0_earned, entry.star_1_earned, entry.star_2_earned].filter(Boolean).length}/3
                      {" · "}{entry.loot_claimed === true ? "Reward claimed" : "Reward unclaimed"}
                    </p>
                  </div>
                }</For>
                <For each={props.tf2Features?.questRewards ?? []}>{(entry) =>
                  <div class="rounded-lg border border-slate-800 bg-slate-950 p-3">
                    <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Quest reward purchase</p>
                    <p class="mt-1 text-sm text-slate-200">Reward {String(entry.defindex ?? "recorded")}</p>
                    <p class="mt-1 text-xs text-slate-500">Count {String(entry.count ?? 1)} · cycle {String(entry.map_cycle ?? "unavailable")}</p>
                  </div>
                }</For>
                <For each={tf2Activity()}>{(entry) => {
                  const ownedItem = () => {
                    const definitionId = Number(entry.data.def_index ?? 0);
                    return (snapshot()?.items ?? []).find(
                      (item) => item.definitionId === definitionId,
                    );
                  };
                  return <div class="rounded-lg border border-slate-800 bg-slate-950 p-3">
                    <div class="flex items-start justify-between gap-2"><p class="text-xs font-semibold uppercase tracking-wide text-slate-500">{entry.kind.replaceAll("_", " ")}</p><button class="text-xs text-slate-600 hover:text-slate-300" onClick={() => dismissActivity(`${entry.kind}:${entry.id ?? ""}`)}>Dismiss</button></div>
                    <p class="mt-1 text-sm text-slate-200">
                      {entry.kind === "item_pickup"
                        ? ownedItem()?.name ?? `Item definition ${String(entry.data.def_index ?? "unknown")}`
                        : String(entry.data.notification_string ?? (entry.id ? `Record ${entry.id}` : "New TF2 activity"))}
                    </p>
                    <Show when={entry.timestamp}><p class="mt-1 text-xs text-slate-500">{new Date(entry.timestamp! * 1000).toLocaleString()}</p></Show>
                  </div>;
                }}</For>
                <Show when={props.tf2Features?.matchmaking}>
                  <div class="rounded-lg border border-slate-800 bg-slate-950 p-3">
                    <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Matchmaking context</p>
                    <p class="mt-1 text-sm text-slate-200">Population and datacenter state received</p>
                    <p class="mt-1 text-xs text-slate-500">Coordinator availability is shown only when supplied; missing regions are not treated as zero population.</p>
                  </div>
                </Show>
              </div>
            </Show>
          </div>
        </details>
      </Show>
      <div class="grid min-h-0 flex-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.95fr)]">
        <PullToRefresh
          ref={(element) => {
            gridViewport = element;
          }}
          class="min-h-0 overflow-y-auto pr-1"
          onRefresh={props.onRefresh}
          onScroll={(event) =>
            handleInventoryScroll(event.currentTarget.scrollTop)
          }
        >
          <div
            class="relative"
            style={{
              height: `${virtualGrid().totalRows * virtualGrid().rowHeight}px`,
            }}
          >
            <div
              class="absolute inset-x-0 grid gap-3"
              style={{
                transform: `translateY(${virtualGrid().firstRow * virtualGrid().rowHeight}px)`,
                "grid-template-columns": `repeat(${virtualGrid().columns}, minmax(0, 1fr))`,
              }}
            >
              <For each={virtualGrid().visibleItems}>
                {(item) => (
                  <button
                    type="button"
                    style={{
                      height: props.compactMode === "icons" ? "104px" : "146px",
                      contain: "layout paint style",
                    }}
                    class={item.game === "tf2"
                      ? `inventory-item-card group relative flex cursor-pointer flex-col overflow-hidden rounded-2xl border-2 bg-slate-950 p-3 text-left transition focus:outline-none ${selected()?.assetId === item.assetId ? "border-slate-400 bg-slate-900" : "border-slate-800 hover:border-slate-600"}`
                      : `inventory-item-card rarity-outline group relative flex cursor-pointer flex-col overflow-hidden rounded-2xl border-2 bg-slate-950 p-3 text-left transition duration-150 focus:outline-none focus:ring-2 focus:ring-cyan-400/50 ${economyOutlineClass(item)} ${selected()?.assetId === item.assetId ? "is-selected ring-2 ring-cyan-300" : "hover:brightness-110"}`}
                    aria-pressed={selected()?.assetId === item.assetId}
                    onClick={() => props.setSelectedAssetId(item.assetId)}
                  >
                    <ItemMarketBadges
                      item={item}
                      priceMinor={marketPrices().get(item.marketName ?? "")}
                    />
                    <ItemImage item={item} />
                    <Show when={props.compactMode !== "icons"}>
                      <p class="mt-2 line-clamp-2 text-sm font-medium text-slate-100">
                        {item.name}
                      </p>
                      <Show when={item.details.customName}>
                        <p class="mt-0.5 truncate text-xs text-cyan-200">
                          “{item.details.customName}”
                        </p>
                      </Show>
                      <Show when={item.quantity > 1}>
                        <p class="mt-1 text-xs text-slate-400">
                          Quantity {item.quantity}
                        </p>
                      </Show>
                    </Show>
                  </button>
                )}
              </For>
            </div>
          </div>
          <Show
            when={
              (props.loading || snapshot()?.status === "loading") &&
              items().length === 0
            }
          >
            <InventoryLoadingState
              active
              title={`Loading ${title()}`}
              stages={economyInventoryLoadingStages[props.game]}
              currentStage={snapshot()?.message}
            />
          </Show>
          <Show when={snapshot()?.status === "ready" && items().length === 0}>
            <p class="rounded-2xl border border-slate-800 p-5 text-sm text-slate-400">
              No matching items.
            </p>
          </Show>
        </PullToRefresh>
        <aside class="min-h-0 overflow-y-auto rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
          <Show
            when={selected()}
            fallback={
              <p class="text-sm text-slate-400">
                Select an item to inspect it.
              </p>
            }
          >
            {(item) => (
              <div>
                <div class="relative overflow-hidden">
                  <ItemMarketBadges
                    item={item()}
                    priceMinor={marketPrices().get(item().marketName ?? "")}
                  />
                  <ItemImage item={item()} large />
                </div>
                <h2 class="mt-3 text-xl font-semibold text-slate-50">
                  {item().name}
                </h2>
                <Show when={item().details.customName}>
                  <p class="mt-1 text-sm font-medium text-cyan-200">
                    Name Tag: “{item().details.customName}”
                  </p>
                </Show>
                <Show when={item().type}>
                  <p class="mt-1 text-sm text-slate-400">{item().type}</p>
                </Show>
                <dl class="mt-4 grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-3 rounded-2xl border border-slate-800/80 bg-slate-900/70 p-3 text-sm text-slate-300">
                  <Show when={item().rarity}>
                    <div>
                      <dt class="text-xs uppercase tracking-wide text-slate-500">
                        Rarity
                      </dt>
                      <dd class="mt-1 text-slate-200">{item().rarity}</dd>
                    </div>
                  </Show>
                  <Show when={item().quality}>
                    <div>
                      <dt class="text-xs uppercase tracking-wide text-slate-500">
                        Quality
                      </dt>
                      <dd class="mt-1 text-slate-200">{item().quality}</dd>
                    </div>
                  </Show>
                  <Show
                    when={marketPriceLabel(
                      item(),
                      marketPrices().get(item().marketName ?? ""),
                    )}
                  >
                    {(price) => (
                      <div>
                        <dt class="text-xs uppercase tracking-wide text-slate-500">
                          Steam Market price
                        </dt>
                        <dd class="mt-1 font-medium text-emerald-200">
                          {price()}
                        </dd>
                      </div>
                    )}
                  </Show>
                  <div>
                    <dt class="text-xs uppercase tracking-wide text-slate-500">
                      Trade state
                    </dt>
                    <dd class="mt-1 text-slate-200">
                      {tradeStateDescription(item())}
                    </dd>
                  </div>
                  <div>
                    <dt class="text-xs uppercase tracking-wide text-slate-500">
                      Asset identity
                    </dt>
                    <dd class="mt-1 break-all font-mono text-xs text-slate-300">
                      {item().assetId}
                    </dd>
                  </div>
                  <div>
                    <dt class="text-xs uppercase tracking-wide text-slate-500">
                      Level and style
                    </dt>
                    <dd class="mt-1 text-slate-200">
                      Level {item().details.level} · Style{" "}
                      {item().details.style}
                    </dd>
                  </div>
                  <Show
                    when={
                      item().game === "tf2" &&
                      item().details.game === "tf2" &&
                      item().details.equipSlot
                    }
                  >
                    <div>
                      <dt class="text-xs uppercase tracking-wide text-slate-500">
                        Equip slot
                      </dt>
                      <dd class="mt-1 text-slate-200">
                        {item().details.game === "tf2"
                          ? item().details.equipSlot
                          : ""}
                      </dd>
                    </div>
                  </Show>
                  <Show
                    when={
                      item().game === "tf2" &&
                      item().details.game === "tf2" &&
                      item().details.usableClasses?.length
                    }
                  >
                    <div>
                      <dt class="text-xs uppercase tracking-wide text-slate-500">
                        Usable classes
                      </dt>
                      <dd class="mt-1 text-slate-200">
                        {item().details.game === "tf2"
                          ? item().details.usableClasses?.join(", ")
                          : ""}
                      </dd>
                    </div>
                  </Show>
                  <Show when={selectedTF2Details()?.itemKind}>
                    <div>
                      <dt class="text-xs uppercase tracking-wide text-slate-500">
                        TF2 item kind
                      </dt>
                      <dd class="mt-1 text-slate-200">
                        {selectedTF2Details()?.itemKind}
                      </dd>
                    </div>
                  </Show>
                  <Show when={selectedTF2Details()?.collection}>
                    <div>
                      <dt class="text-xs uppercase tracking-wide text-slate-500">
                        Collection
                      </dt>
                      <dd class="mt-1 text-slate-200">
                        {selectedTF2Details()?.collection}
                      </dd>
                    </div>
                  </Show>
                  <Show when={selectedTF2Details()?.equipRegions?.length}>
                    <div>
                      <dt class="text-xs uppercase tracking-wide text-slate-500">
                        Equip regions
                      </dt>
                      <dd class="mt-1 text-slate-200">
                        {selectedTF2Details()?.equipRegions?.join(", ")}
                      </dd>
                    </div>
                  </Show>
                  <Show
                    when={
                      item().game === "dota2" &&
                      item().details.game === "dota2" &&
                      item().details.hero
                    }
                  >
                    <div>
                      <dt class="text-xs uppercase tracking-wide text-slate-500">
                        Hero
                      </dt>
                      <dd class="mt-1 text-slate-200">
                        {item().details.game === "dota2"
                          ? item().details.hero
                          : ""}
                      </dd>
                    </div>
                  </Show>
                  <Show
                    when={
                      item().game === "dota2" &&
                      item().details.game === "dota2" &&
                      item().details.slot
                    }
                  >
                    <div>
                      <dt class="text-xs uppercase tracking-wide text-slate-500">
                        Slot
                      </dt>
                      <dd class="mt-1 text-slate-200">
                        {item().details.game === "dota2"
                          ? item().details.slot
                          : ""}
                      </dd>
                    </div>
                  </Show>
                  <Show when={selectedServiceDetails()?.serviceDefinitionId}>
                    <div>
                      <dt class="text-xs uppercase tracking-wide text-slate-500">
                        Definition ID
                      </dt>
                      <dd class="mt-1 break-all font-mono text-xs text-slate-200">
                        {selectedServiceDetails()?.serviceDefinitionId}
                      </dd>
                    </div>
                  </Show>
                  <Show when={selectedServiceDetails()?.serviceState}>
                    <div>
                      <dt class="text-xs uppercase tracking-wide text-slate-500">
                        Service state
                      </dt>
                      <dd class="mt-1 text-slate-200">
                        {selectedServiceDetails()?.serviceState}
                      </dd>
                    </div>
                  </Show>
                  <Show when={selectedServiceDetails()?.serviceOrigin}>
                    <div>
                      <dt class="text-xs uppercase tracking-wide text-slate-500">
                        Origin
                      </dt>
                      <dd class="mt-1 text-slate-200">
                        {selectedServiceDetails()?.serviceOrigin}
                      </dd>
                    </div>
                  </Show>
                  <Show when={selectedServiceDetails()?.acquiredAt}>
                    <div>
                      <dt class="text-xs uppercase tracking-wide text-slate-500">
                        Acquired
                      </dt>
                      <dd class="mt-1 text-slate-200">
                        {selectedServiceDetails()?.acquiredAt}
                      </dd>
                    </div>
                  </Show>
                </dl>
                <div class="mt-4">
                  <VendorPricePreview
                    appId={item().appId}
                    marketName={item().marketName}
                    marketable={item().marketable}
                    result={selectedPriceScan()}
                    loading={selectedPriceScanLoading()}
                  />
                </div>
                <Show when={selectedTF2Market()}>
                  {(market) => (
                    <div class="mt-3 rounded-lg border border-slate-800 bg-slate-950 p-3">
                      <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        TF2 GC market summary
                      </p>
                      <p class="mt-1 text-sm text-slate-200">
                        {market().sellListings.toLocaleString()} sell listings ·{" "}
                        {selectedTF2MarketPrice()}
                      </p>
                      <p class="mt-1 text-xs text-slate-500">
                        Coordinator summary, not a live order book.
                      </p>
                    </div>
                  )}
                </Show>
                <Show when={item().details.equippedStates?.length}>
                  <p class="mt-3 text-xs text-slate-400">
                    Equipped states:{" "}
                    {item()
                      .details.equippedStates?.map(
                        (state) => `class ${state.class}, slot ${state.slot}`,
                      )
                      .join(" · ")}
                  </p>
                </Show>
                <Show when={item().details.interiorItemId}>
                  <p class="mt-2 text-xs text-slate-400">
                    Contained economy item:{" "}
                    <span class="font-mono">
                      {item().details.interiorItemId}
                    </span>
                  </p>
                </Show>
                <Show when={selectedTF2Details()?.description}>
                  <p class="mt-3 text-sm text-slate-400">
                    {selectedTF2Details()?.description}
                  </p>
                </Show>
                <Show when={item().game === "tf2"}>
                  <div class="mt-4 space-y-2 border-t border-slate-800 pt-4">
                    <Show when={item().inspectUrl}>
                      <button
                        type="button"
                        class="block w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-center text-sm text-slate-200 hover:bg-slate-800"
                        onClick={() =>
                          void resolveTF2Inspect(item().inspectUrl ?? "")
                        }
                      >
                        Resolve inspect details
                      </button>
                    </Show>
                    <Show when={inspectRequestedAt() > 0 && !inspectedTF2Item()}>
                      <p class="text-xs text-slate-500">
                        Waiting for the TF2 Game Coordinator to resolve this item…
                      </p>
                    </Show>
                    <Show when={inspectedTF2Item()}>
                      {(preview) => (
                        <div class="rounded-lg border border-slate-800 bg-slate-950 p-3">
                          <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Resolved inspect result
                          </p>
                          <p class="mt-1 text-sm text-slate-200">
                            Item {String(preview().id ?? "preview")}
                          </p>
                          <p class="mt-1 text-xs text-slate-500">
                            Definition {String(preview().definitionId ?? "unknown")}
                            {" · "}quality {String(preview().qualityId ?? "unknown")}
                            {" · "}level {String(preview().level ?? "unknown")}
                          </p>
                          <dl class="mt-3 grid grid-cols-2 gap-2 text-xs">
                            <div><dt class="text-slate-600">Original item</dt><dd class="break-all text-slate-300">{String(preview().originalId ?? "Unavailable")}</dd></div>
                            <div><dt class="text-slate-600">Style</dt><dd class="text-slate-300">{String(preview().style ?? "Default")}</dd></div>
                            <div><dt class="text-slate-600">Custom name</dt><dd class="text-slate-300">{String(preview().customName ?? "None")}</dd></div>
                            <div><dt class="text-slate-600">Equipped states</dt><dd class="text-slate-300">{preview().equippedStates.length}</dd></div>
                            <div><dt class="text-slate-600">Attributes</dt><dd class="text-slate-300">{preview().attributes.length}</dd></div>
                            <div><dt class="text-slate-600">Nested item</dt><dd class="text-slate-300">{preview().interiorItem ? "Present" : "None"}</dd></div>
                          </dl>
                          <Show when={props.tf2Features?.inspectedAt}>
                            <p class="mt-2 text-xs text-slate-600">Resolved {new Date(props.tf2Features!.inspectedAt!).toLocaleString()}</p>
                          </Show>
                        </div>
                      )}
                    </Show>
                    <Show when={props.settings?.featureFlags.enableTf2Tools && selectedTF2Details()?.schemaQuality?.toLowerCase() === "strange" && confirmStrangeResetId() !== item().assetId}>
                      <button class="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800" onClick={() => setConfirmStrangeResetId(item().assetId)}>Reset Strange counters</button>
                    </Show>
                    <Show
                      when={
                        props.settings?.featureFlags.enableTf2Tools &&
                        selectedTF2Item() &&
                        selectedTF2Details()?.schemaQuality?.toLowerCase() ===
                          "strange" &&
                        props.onOperation
                      }
                    >
                      <TF2StrangeWorkshop
                        item={selectedTF2Item()!}
                        items={(snapshot()?.items ?? []).filter(
                          (candidate): candidate is Extract<
                            EconomyInventoryItemDto,
                            { game: "tf2" }
                          > => candidate.game === "tf2",
                        )}
                        enabled={
                          props.settings?.featureFlags.enableTf2Tools === true
                        }
                        onOperation={props.onOperation!}
                      />
                    </Show>
                    <Show when={confirmStrangeResetId() === item().assetId}>
                      <div class="rounded-lg border border-red-900 bg-slate-950 p-3"><p class="text-xs text-slate-300">Reset every Strange counter on this item permanently?</p><div class="mt-2 flex gap-2"><button class="rounded-lg bg-red-800 px-3 py-1.5 text-xs text-white" onClick={() => { setConfirmStrangeResetId(undefined); void submitTF2Operation("tf2.tools.strange-reset", { game: "tf2", itemId: item().assetId, confirmed: true }); }}>Reset counters</button><button class="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300" onClick={() => setConfirmStrangeResetId(undefined)}>Cancel</button></div></div>
                    </Show>
                    <Show
                      when={
                        props.settings?.featureFlags.enableTf2ItemUse &&
                        confirmUseItemId() !== item().assetId
                      }
                    >
                      <button
                        type="button"
                        class="w-full rounded-xl border border-amber-500/40 bg-amber-950/30 px-3 py-2 text-sm text-amber-100"
                        onClick={() => setConfirmUseItemId(item().assetId)}
                      >
                        Use TF2 item
                      </button>
                    </Show>
                    <Show
                      when={
                        props.settings?.featureFlags.enableTf2ItemUse &&
                        confirmUseItemId() === item().assetId
                      }
                    >
                      <div class="rounded-xl border border-red-500/40 bg-red-950/30 p-3">
                        <p class="text-xs text-red-100">
                          This permanently consumes or changes {item().name}.
                          Confirm the exact item ID{" "}
                          <span class="font-mono">{item().assetId}</span>.
                        </p>
                        <div class="mt-2 flex gap-2">
                          <button
                            type="button"
                            class="rounded-lg bg-red-700 px-3 py-1.5 text-xs text-white"
                            onClick={() => {
                              setConfirmUseItemId(undefined);
                              void submitTF2Operation("tf2.items.use", {
                                game: "tf2",
                                itemId: item().assetId,
                                confirmed: true,
                              });
                            }}
                          >
                            Confirm permanent use
                          </button>
                          <button
                            type="button"
                            class="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300"
                            onClick={() => setConfirmUseItemId(undefined)}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    </Show>
                    <Show when={selectedTF2Details()?.itemKind === "container"}>
                      <p class="text-xs text-slate-500">
                        TF2 unboxing remains capture-gated. Enabling its
                        permanent-action flag does not bypass the backend
                        protocol-evidence block.
                      </p>
                    </Show>
                    <Show
                      when={
                        selectedTF2Details()?.itemKind === "container" &&
                        selectedTF2Details()?.containerItems?.length
                      }
                    >
                      <details class="rounded-xl border border-slate-800 p-3">
                        <summary class="cursor-pointer text-sm font-medium text-slate-300">
                          Possible schema contents (
                          {selectedTF2Details()?.containerItems?.length})
                        </summary>
                        <ul class="mt-2 max-h-52 space-y-1 overflow-y-auto text-xs text-slate-400">
                          <For each={selectedTF2Details()?.containerItems}>
                            {(entry) => (
                              <li class="grid grid-cols-[2rem_1fr_auto] items-center gap-2">
                                <Show
                                  when={entry.imageUrl}
                                  fallback={
                                    <div class="grid h-8 w-8 place-items-center rounded bg-slate-900 text-slate-600">
                                      ?
                                    </div>
                                  }
                                >
                                  {(url) => (
                                    <img
                                      class="h-8 w-8 rounded bg-slate-900 object-contain"
                                      src={url()}
                                      alt=""
                                      loading="lazy"
                                      referrerpolicy="no-referrer"
                                    />
                                  )}
                                </Show>
                                <span>{entry.name}</span>
                                <span>
                                  {entry.poolKind === "unresolved"
                                    ? "unresolved"
                                    : entry.rarity || "unknown rarity"}
                                </span>
                              </li>
                            )}
                          </For>
                        </ul>
                        <p class="mt-2 text-xs text-slate-500">
                          Possible contents only. Exact odds and bonus-drop
                          behavior are not inferred.
                        </p>
                      </details>
                    </Show>
                    <Show
                      when={
                        props.settings?.featureFlags.enableTf2Unboxing &&
                        selectedTF2Details()?.itemKind === "container" &&
                        selectedTF2Details()?.containerItems?.some(
                          (entry) => entry.poolKind !== "unresolved",
                        )
                      }
                    >
                      <button
                        type="button"
                        class="w-full rounded-xl border border-violet-500/40 bg-violet-950/30 px-3 py-2 text-sm text-violet-100"
                        onClick={previewTF2Container}
                      >
                        Preview unboxing animation
                      </button>
                      <p class="text-xs text-slate-500">
                        Offline preview only; no item is consumed or awarded.
                      </p>
                    </Show>
                    <Show when={operationStatus()}>
                      <p class="text-xs text-slate-400">{operationStatus()}</p>
                    </Show>
                  </div>
                </Show>
                <Show when={selectedTF2Item()}>
                  {(tf2Item) => (
                    <div class="mt-4">
                      <TF2ItemDiagnostics item={tf2Item()} />
                    </div>
                  )}
                </Show>
                <Show when={selectedSteamItem()}>
                  {(steamItem) => (
                    <div class="mt-4">
                      <SteamItemDiagnostics
                        item={steamItem()}
                        priceScan={selectedPriceScan()}
                        priceScanLoading={selectedPriceScanLoading()}
                      />
                    </div>
                  )}
                </Show>
                <Show
                  when={
                    selectedServiceDetails() &&
                    Object.keys(
                      selectedServiceDetails()?.dynamicProperties ?? {},
                    ).length > 0
                  }
                >
                  <details class="mt-4 rounded-2xl border border-slate-800/80 p-3 text-sm text-slate-400">
                    <summary class="cursor-pointer font-medium text-slate-200">
                      Dynamic properties
                    </summary>
                    <dl class="mt-3 space-y-2 font-mono text-xs">
                      <For
                        each={Object.entries(
                          selectedServiceDetails()?.dynamicProperties ?? {},
                        )}
                      >
                        {([key, value]) => (
                          <div class="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-3">
                            <dt class="break-all text-slate-500">{key}</dt>
                            <dd class="break-all text-right text-slate-200">
                              {value}
                            </dd>
                          </div>
                        )}
                      </For>
                    </dl>
                  </details>
                </Show>
                <Show when={item().marketName && item().marketable}>
                  <a
                    class="mt-4 inline-block text-sm font-medium text-sky-300 underline underline-offset-4"
                    href={marketURL(item())}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open exact Steam listing ↗
                  </a>
                </Show>
                <Show when={selectedInventoryURL()}>
                  {(viewURL) => (
                    <div class="mt-3 grid gap-2 sm:grid-cols-2">
                      <a
                        class="block w-full rounded-xl border border-sky-500/40 bg-sky-950/30 px-4 py-3 text-center text-sm font-semibold text-sky-100 hover:bg-sky-900/40"
                        href={viewURL()}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        View in inventory ↗
                      </a>
                      <Show when={selectedSaleURL()}>
                        {(url) => (
                          <a
                            class="block w-full rounded-xl border border-emerald-500/40 bg-emerald-950/30 px-4 py-3 text-center text-sm font-semibold text-emerald-100 hover:bg-emerald-900/40"
                            href={url()}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Sell on Steam ↗
                          </a>
                        )}
                      </Show>
                    </div>
                  )}
                </Show>
                <Show when={item().descriptions?.length}>
                  <div class="mt-4 space-y-2 border-t border-slate-800 pt-4 text-sm text-slate-400">
                    <For each={item().descriptions}>
                      {(line) => <p>{line}</p>}
                    </For>
                  </div>
                </Show>
              </div>
            )}
          </Show>
        </aside>
      </div>
      <RevealAnimation
        open={!!tf2ContainerPreview()}
        ready
        mode={props.settings?.animations?.container ?? "slot-machine"}
        title="TF2 unboxing preview"
        candidates={tf2ContainerPreview()?.candidates ?? []}
        result={tf2ContainerPreview()?.result ?? { name: "TF2 item" }}
        onComplete={() => setTF2ContainerPreview(undefined)}
      />
    </div>
  );
}
