import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import type { EconomyGame, EconomyInventoryItemDto, GameInventorySnapshot, OperationReceipt, PriceScanResult, SettingsData } from "@cs-inv-edit/contracts";
import { Alert } from "./ui/Alert.js";
import { InventoryLoadingState } from "./ui/InventoryLoadingState.js";
import type { LoadingStage } from "./ui/LoadingProgress.js";
import { PullToRefresh } from "./ui/PullToRefresh.js";
import { calculateVirtualInventoryWindow, economyOutlineClass, snapshotForGame, virtualInventoryWindowChanged } from "./game-inventory-utils.js";
import { ItemMarketBadges, marketPriceLabel, tradeStateDescription } from "./ItemMarketBadges.js";
import { steamHostedSaleURL, steamInventoryAssetURL } from "./steam-hosted-selling.js";
import { VendorPricePreview } from "./VendorPricePreview.js";
import { RevealAnimation, randomRevealCandidate, type RevealItem } from "./ui/RevealAnimation.js";
import { ItemPreviewMedia } from "./ItemPreviewMedia.js";

const economyInventoryLoadingStages: Record<EconomyGame, readonly LoadingStage[]> = {
	steam: [
		{ afterSeconds: 0, label: "Contacting Steam inventory services", detail: "Requesting the owned-item inventory for this Steam account." },
		{ afterSeconds: 8, label: "Waiting for inventory data", detail: "Steam may take several seconds to return the complete inventory snapshot." },
		{ afterSeconds: 20, label: "Resolving current item metadata", detail: "Matching item descriptions, names, tags, and available image tokens." },
		{ afterSeconds: 45, label: "Still working—Steam is responding slowly", detail: "The request remains active while bounded metadata lookups finish." },
	],
	tf2: [
		{ afterSeconds: 0, label: "Contacting the TF2 Game Coordinator", detail: "Requesting the authoritative owned-item SOCache for this Steam account." },
		{ afterSeconds: 8, label: "Waiting for TF2 inventory data", detail: "The Game Coordinator can take several retries before it sends the inventory snapshot." },
		{ afterSeconds: 20, label: "Resolving current TF2 item metadata", detail: "Matching schema definitions, localized names, qualities, classes, and equip slots." },
		{ afterSeconds: 45, label: "Still working—Steam is responding slowly", detail: "The request remains active while bounded metadata lookups finish." },
	],
	dota2: [
		{ afterSeconds: 0, label: "Contacting the Dota 2 Game Coordinator", detail: "Requesting the authoritative owned-item SOCache for this Steam account." },
		{ afterSeconds: 8, label: "Waiting for Dota 2 inventory data", detail: "The Game Coordinator can take several retries before it sends the inventory snapshot." },
		{ afterSeconds: 20, label: "Resolving current Dota 2 item metadata", detail: "Matching item names, rarities, heroes, slots, and available images." },
		{ afterSeconds: 45, label: "Still working—Steam is responding slowly", detail: "The request remains active while bounded metadata lookups finish." },
	],
};

function marketURL(item: EconomyInventoryItemDto) {
  return `https://steamcommunity.com/market/listings/${item.appId}/${encodeURIComponent(item.marketName ?? "")}`;
}

function ItemImage(props: { item: EconomyInventoryItemDto; large?: boolean }) {
  return <ItemPreviewMedia name={props.item.name} imageUrl={props.item.imageUrl} variant={props.large ? "details" : "economy-card"} />;
}

function TF2ItemDiagnostics(props: { item: Extract<EconomyInventoryItemDto, { game: "tf2" }> }) {
	const details = () => props.item.details;
	return <details class="rounded-2xl border border-slate-800/80 p-3 text-sm text-slate-400">
		<summary class="cursor-pointer font-medium text-slate-200">Item diagnostics</summary>
		<div class="mt-3 space-y-3">
			<div class="grid gap-1 font-mono text-xs"><p>GC item ID: {props.item.assetId}</p><p>Definition index: {props.item.definitionId ?? "unknown"}</p><p>Inventory position: {details().inventoryPosition}</p><p>Quality ID: {details().qualityId}</p><p>Origin ID: {details().originId}</p><p>Flags: {details().flags}</p></div>
			<Show when={details().decodedAttributes?.length}><section class="border-t border-slate-800 pt-3"><h4 class="font-medium text-slate-200">Decoded attributes</h4><dl class="mt-2 space-y-2"><For each={details().decodedAttributes}>{(attribute) => <div class="grid grid-cols-[minmax(0,1fr)_auto] gap-3"><dt><span class="text-slate-200">{attribute.name}</span><span class="ml-1 font-mono text-[10px] text-slate-600">#{attribute.defIndex}</span><Show when={attribute.hidden}><span class="ml-1 text-[10px] uppercase text-slate-600">hidden</span></Show></dt><dd class="max-w-64 break-words text-right font-medium text-cyan-100">{attribute.value}</dd></div>}</For></dl></section></Show>
			<details class="border-t border-slate-800 pt-3"><summary class="cursor-pointer text-xs font-medium text-slate-400">Raw GC attribute payloads</summary><div class="mt-2 grid gap-3 font-mono text-xs"><Show when={Object.keys(details().attributes).length}><div><p class="mb-1 text-slate-500">32-bit values</p><For each={Object.entries(details().attributes)}>{([id, value]) => <p class="flex justify-between gap-3"><span>{id}</span><span>{value}</span></p>}</For></div></Show><Show when={Object.keys(details().attributeBytes ?? {}).length}><div><p class="mb-1 text-slate-500">Binary values</p><For each={Object.entries(details().attributeBytes ?? {})}>{([id, value]) => <p class="grid grid-cols-[auto_1fr] gap-3"><span>{id}</span><span class="break-all text-right">{value}</span></p>}</For></div></Show></div></details>
		</div>
	</details>;
}

function SteamItemDiagnostics(props: { item: Extract<EconomyInventoryItemDto, { game: "steam" }>; priceScan?: PriceScanResult; priceScanLoading: boolean }) {
	const quotes = () => props.priceScan?.items.find((entry) => entry.marketName === props.item.marketName)?.quotes ?? [];
	return <details class="rounded-2xl border border-slate-800/80 p-3 text-sm text-slate-400">
		<summary class="cursor-pointer font-medium text-slate-200">Item diagnostics</summary>
		<div class="mt-3 space-y-3">
			<div class="grid gap-1 font-mono text-xs">
				<p>App ID: {props.item.appId}</p><p>Context ID: {props.item.contextId ?? "unknown"}</p><p>Asset ID: {props.item.assetId}</p><p>Class ID: {props.item.classId ?? "unknown"}</p><p>Instance ID: {props.item.instanceId ?? "unknown"}</p><p>Market hash name: {props.item.marketName ?? "missing"}</p><p>Marketable: {String(props.item.marketable)}</p><p>Tradable: {String(props.item.tradable)}</p>
			</div>
			<section class="border-t border-slate-800 pt-3">
				<h4 class="font-medium text-slate-200">Steam Market lookup</h4>
				<Show when={props.priceScanLoading}><p class="mt-2 text-sky-300">Request in progress…</p></Show>
				<Show when={!props.priceScanLoading && !props.item.marketName}><p class="mt-2 text-amber-300">No market hash name was supplied by the Steam item description.</p></Show>
				<Show when={!props.priceScanLoading && props.item.marketName && !props.item.marketable}><p class="mt-2 text-slate-500">Lookup skipped because Steam marks this item as non-marketable.</p></Show>
				<Show when={props.priceScan?.scannedAt}><p class="mt-2 font-mono text-xs">Scanned: {props.priceScan?.scannedAt}</p></Show>
				<For each={quotes()}>{(quote) => <p class="mt-2 text-xs"><span class="text-slate-200">{quote.source}</span>: {quote.displayPrice || "no display price"}<Show when={quote.listingCount !== undefined}> · {quote.listingCount} listings</Show></p>}</For>
				<For each={props.priceScan?.errors ?? []}>{(error) => <p class="mt-2 break-words text-xs text-amber-300">{error.source}: {error.message}</p>}</For>
				<Show when={!props.priceScanLoading && props.priceScan && quotes().length === 0 && props.priceScan.errors.length === 0}><p class="mt-2 text-xs text-slate-500">Steam returned no active listing for this exact market hash name.</p></Show>
			</section>
		</div>
	</details>;
}

export function GameInventoryView(props: { game: EconomyGame; loading: boolean; snapshot?: GameInventorySnapshot; connected?: boolean; steamId?: string; settings?: SettingsData; query: string; tagFilter: string; selectedAssetId?: string; setSelectedAssetId: (id: string | undefined) => void; compactMode: "icons" | "concise" | "detailed"; onRefresh: () => void; onScanPrices: (marketNames: string[], appId?: number) => Promise<PriceScanResult | undefined>; onOperation?: (type: string, input: unknown) => Promise<OperationReceipt> }) {
	const [scrollTop, setScrollTop] = createSignal(0);
	const [viewport, setViewport] = createSignal({ width: 800, height: 600 });
	const [operationStatus, setOperationStatus] = createSignal("");
	const [confirmUseItemId, setConfirmUseItemId] = createSignal<string>();
	const [marketPrices, setMarketPrices] = createSignal<ReadonlyMap<string, number>>(new Map());
	const [selectedPriceScan, setSelectedPriceScan] = createSignal<PriceScanResult>();
	const [selectedPriceScanLoading, setSelectedPriceScanLoading] = createSignal(false);
	const [tf2ContainerPreview, setTF2ContainerPreview] = createSignal<{ candidates: RevealItem[]; result: RevealItem }>();
	const requestedPriceNames = new Set<string>();
	let priceInventoryKey = "";
	let requestedSelectedPrice = "";
	let gridViewport: HTMLDivElement | undefined;
	const snapshot = () => snapshotForGame(props.game, props.snapshot);
	const title = () => props.game === "steam" ? "Steam Inventory" : props.game === "tf2" ? "Team Fortress 2 Inventory" : "Dota 2 Inventory";
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
			const queryMatches = !query || `${item.name} ${item.marketName ?? ""} ${item.type ?? ""} ${item.rarity ?? ""} ${item.quality ?? ""}`.toLowerCase().includes(query);
			const tagMatches = !filterCategory || item.tags.some((tag) => tag.category.toLowerCase() === filterCategory && tag.internalName === filterName);
			return queryMatches && tagMatches;
		});
  });
	const selected = createMemo(() => items().find((item) => item.assetId === props.selectedAssetId) ?? items()[0]);
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
	const selectedTF2Item = createMemo((): Extract<EconomyInventoryItemDto, { game: "tf2" }> | undefined => {
		const item = selected();
		return item?.game === "tf2" ? item : undefined;
	});
	const selectedSteamItem = createMemo((): Extract<EconomyInventoryItemDto, { game: "steam" }> | undefined => {
		const item = selected();
		return item?.game === "steam" ? item : undefined;
	});
	const previewTF2Container = () => {
		const details = selectedTF2Details();
		const resolved = (details?.containerItems ?? []).filter((entry) => entry.poolKind !== "unresolved");
		const pictured = resolved.filter((entry) => entry.imageUrl);
		const candidates = (pictured.length > 0 ? pictured : resolved).map((entry) => ({ name: entry.name, rarity: entry.rarity, imageUrl: entry.imageUrl }));
		if (candidates.length === 0) return;
		setTF2ContainerPreview({ candidates, result: randomRevealCandidate(candidates, candidates[0]) });
	};
	const selectedSaleURL = createMemo(() => {
		const item = selected();
		if (!item?.contextId) return undefined;
		return steamHostedSaleURL({ steamId: props.steamId, appId: item.appId, contextId: item.contextId, assetId: item.assetId, marketable: item.marketable });
	});
	const selectedInventoryURL = createMemo(() => {
		const item = selected();
		if (!props.steamId || !item?.contextId || (props.game !== "steam" && props.game !== "tf2")) return undefined;
		return steamInventoryAssetURL(props.steamId, { appId: item.appId, contextId: item.contextId, assetId: item.assetId });
	});
	const submitTF2Operation = async (type: string, input: unknown) => {
		if (!props.onOperation) return;
		setOperationStatus("Submitting…");
		const receipt = await props.onOperation(type, input);
		setOperationStatus(receipt.message ?? receipt.state);
	};
	const virtualGrid = createMemo(() => {
		const window = calculateVirtualInventoryWindow(items().length, viewport().width, viewport().height, scrollTop(), props.compactMode);
		return { ...window, visibleItems: items().slice(window.firstItem, window.lastItem) };
	});
	createEffect(() => {
		const current = snapshot();
		const inventoryKey = `${current?.appId ?? 0}\u0000${current?.refreshedAt ?? ""}`;
		if (priceInventoryKey !== inventoryKey) {
			priceInventoryKey = inventoryKey;
			requestedPriceNames.clear();
			setMarketPrices(new Map());
		}
		const names = [...new Set(virtualGrid().visibleItems.filter((item) => item.marketable).map((item) => item.marketName).filter((value): value is string => !!value && !requestedPriceNames.has(value)))];
		if (names.length === 0) return;
		for (const name of names) requestedPriceNames.add(name);
		void props.onScanPrices(names, current?.appId).then((result) => {
			if (!result || priceInventoryKey !== inventoryKey) return;
			setMarketPrices((existing) => {
				const prices = new Map(existing);
				for (const entry of result.items) prices.set(entry.marketName, entry.quotes.find((quote) => quote.source === "steam")?.amountMinor ?? 0);
				return prices;
			});
		});
	});
	const handleInventoryScroll = (nextScrollTop: number) => {
		if (virtualInventoryWindowChanged(items().length, viewport().width, viewport().height, scrollTop(), nextScrollTop, props.compactMode)) setScrollTop(nextScrollTop);
	};
	onMount(() => {
		if (!gridViewport) return;
		const update = () => setViewport({ width: gridViewport?.clientWidth ?? 800, height: gridViewport?.clientHeight ?? 600 });
		update();
		const observer = new ResizeObserver(update);
		observer.observe(gridViewport);
		onCleanup(() => observer.disconnect());
	});

  return <div class="flex min-h-0 flex-1 flex-col gap-4">
	<Show when={snapshot()?.status === "requires_connection" && props.connected === false}><Alert variant="warning">Connect a Steam account, then refresh this inventory.</Alert></Show>
	<Show when={snapshot()?.status === "error"}><Alert variant="danger">{snapshot()?.error || "Inventory loading failed"}</Alert></Show>
    <div class="grid min-h-0 flex-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.95fr)]">
      <PullToRefresh ref={(element) => { gridViewport = element; }} class="min-h-0 overflow-y-auto pr-1" onRefresh={props.onRefresh} onScroll={(event) => handleInventoryScroll(event.currentTarget.scrollTop)}>
		<div class="relative" style={{ height: `${virtualGrid().totalRows * virtualGrid().rowHeight}px` }}>
		<div class="absolute inset-x-0 grid gap-3" style={{ transform: `translateY(${virtualGrid().firstRow * virtualGrid().rowHeight}px)`, "grid-template-columns": `repeat(${virtualGrid().columns}, minmax(0, 1fr))` }}>
			<For each={virtualGrid().visibleItems}>{(item) => <button type="button" style={{ height: props.compactMode === "icons" ? "104px" : "146px", contain: "layout paint style" }} class={`inventory-item-card rarity-outline group relative flex cursor-pointer flex-col overflow-hidden rounded-2xl border-2 bg-slate-950 p-3 text-left transition duration-150 focus:outline-none focus:ring-2 focus:ring-cyan-400/50 ${economyOutlineClass(item)} ${selected()?.assetId === item.assetId ? "is-selected ring-2 ring-cyan-300" : "hover:brightness-110"}`} aria-pressed={selected()?.assetId === item.assetId} onClick={() => props.setSelectedAssetId(item.assetId)}>
			  <ItemMarketBadges item={item} priceMinor={marketPrices().get(item.marketName ?? "")} />
          <ItemImage item={item} />
          <Show when={props.compactMode !== "icons"}><p class="mt-2 line-clamp-2 text-sm font-medium text-slate-100">{item.name}</p><Show when={item.details.customName}><p class="mt-0.5 truncate text-xs text-cyan-200">“{item.details.customName}”</p></Show><Show when={item.quantity > 1}><p class="mt-1 text-xs text-slate-400">Quantity {item.quantity}</p></Show></Show>
        </button>}</For>
		</div></div>
		<Show when={(props.loading || snapshot()?.status === "loading") && items().length === 0}>
			<InventoryLoadingState active title={`Loading ${title()}`} stages={economyInventoryLoadingStages[props.game]} currentStage={snapshot()?.message} />
		</Show>
		<Show when={snapshot()?.status === "ready" && items().length === 0}><p class="rounded-2xl border border-slate-800 p-5 text-sm text-slate-400">No matching items.</p></Show>
      </PullToRefresh>
      <aside class="min-h-0 overflow-y-auto rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
        <Show when={selected()} fallback={<p class="text-sm text-slate-400">Select an item to inspect it.</p>}>{(item) => <div>
	          <div class="relative overflow-hidden"><ItemMarketBadges item={item()} priceMinor={marketPrices().get(item().marketName ?? "")} /><ItemImage item={item()} large /></div>
          <h2 class="mt-3 text-xl font-semibold text-slate-50">{item().name}</h2>
          <Show when={item().details.customName}><p class="mt-1 text-sm font-medium text-cyan-200">Name Tag: “{item().details.customName}”</p></Show>
          <Show when={item().type}><p class="mt-1 text-sm text-slate-400">{item().type}</p></Show>
          <dl class="mt-4 grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-3 rounded-2xl border border-slate-800/80 bg-slate-900/70 p-3 text-sm text-slate-300">
            <Show when={item().rarity}><div><dt class="text-xs uppercase tracking-wide text-slate-500">Rarity</dt><dd class="mt-1 text-slate-200">{item().rarity}</dd></div></Show>
            <Show when={item().quality}><div><dt class="text-xs uppercase tracking-wide text-slate-500">Quality</dt><dd class="mt-1 text-slate-200">{item().quality}</dd></div></Show>
	            <Show when={marketPriceLabel(item(), marketPrices().get(item().marketName ?? ""))}>{(price) => <div><dt class="text-xs uppercase tracking-wide text-slate-500">Steam Market price</dt><dd class="mt-1 font-medium text-emerald-200">{price()}</dd></div>}</Show>
	            <div><dt class="text-xs uppercase tracking-wide text-slate-500">Trade state</dt><dd class="mt-1 text-slate-200">{tradeStateDescription(item())}</dd></div>
            <div><dt class="text-xs uppercase tracking-wide text-slate-500">Asset identity</dt><dd class="mt-1 break-all font-mono text-xs text-slate-300">{item().assetId}</dd></div>
			<div><dt class="text-xs uppercase tracking-wide text-slate-500">Level and style</dt><dd class="mt-1 text-slate-200">Level {item().details.level} · Style {item().details.style}</dd></div>
			<Show when={item().game === "tf2" && item().details.game === "tf2" && item().details.equipSlot}><div><dt class="text-xs uppercase tracking-wide text-slate-500">Equip slot</dt><dd class="mt-1 text-slate-200">{item().details.game === "tf2" ? item().details.equipSlot : ""}</dd></div></Show>
			<Show when={item().game === "tf2" && item().details.game === "tf2" && item().details.usableClasses?.length}><div><dt class="text-xs uppercase tracking-wide text-slate-500">Usable classes</dt><dd class="mt-1 text-slate-200">{item().details.game === "tf2" ? item().details.usableClasses?.join(", ") : ""}</dd></div></Show>
			<Show when={selectedTF2Details()?.itemKind}><div><dt class="text-xs uppercase tracking-wide text-slate-500">TF2 item kind</dt><dd class="mt-1 text-slate-200">{selectedTF2Details()?.itemKind}</dd></div></Show>
			<Show when={selectedTF2Details()?.collection}><div><dt class="text-xs uppercase tracking-wide text-slate-500">Collection</dt><dd class="mt-1 text-slate-200">{selectedTF2Details()?.collection}</dd></div></Show>
			<Show when={selectedTF2Details()?.equipRegions?.length}><div><dt class="text-xs uppercase tracking-wide text-slate-500">Equip regions</dt><dd class="mt-1 text-slate-200">{selectedTF2Details()?.equipRegions?.join(", ")}</dd></div></Show>
			<Show when={item().game === "dota2" && item().details.game === "dota2" && item().details.hero}><div><dt class="text-xs uppercase tracking-wide text-slate-500">Hero</dt><dd class="mt-1 text-slate-200">{item().details.game === "dota2" ? item().details.hero : ""}</dd></div></Show>
			<Show when={item().game === "dota2" && item().details.game === "dota2" && item().details.slot}><div><dt class="text-xs uppercase tracking-wide text-slate-500">Slot</dt><dd class="mt-1 text-slate-200">{item().details.game === "dota2" ? item().details.slot : ""}</dd></div></Show>
          </dl>
		  <div class="mt-4"><VendorPricePreview appId={item().appId} marketName={item().marketName} marketable={item().marketable} result={selectedPriceScan()} loading={selectedPriceScanLoading()} /></div>
		  <Show when={item().details.equippedStates?.length}><p class="mt-3 text-xs text-slate-400">Equipped states: {item().details.equippedStates?.map((state) => `class ${state.class}, slot ${state.slot}`).join(" · ")}</p></Show>
		  <Show when={item().details.interiorItemId}><p class="mt-2 text-xs text-slate-400">Contained economy item: <span class="font-mono">{item().details.interiorItemId}</span></p></Show>
		  <Show when={selectedTF2Details()?.description}><p class="mt-3 text-sm text-slate-400">{selectedTF2Details()?.description}</p></Show>
		  <Show when={item().game === "tf2"}><div class="mt-4 space-y-2 border-t border-slate-800 pt-4">
			<Show when={props.settings?.featureFlags.enableTf2ItemUse && confirmUseItemId() !== item().assetId}><button type="button" class="w-full rounded-xl border border-amber-500/40 bg-amber-950/30 px-3 py-2 text-sm text-amber-100" onClick={() => setConfirmUseItemId(item().assetId)}>Use TF2 item</button></Show>
			<Show when={props.settings?.featureFlags.enableTf2ItemUse && confirmUseItemId() === item().assetId}><div class="rounded-xl border border-red-500/40 bg-red-950/30 p-3"><p class="text-xs text-red-100">This permanently consumes or changes {item().name}. Confirm the exact item ID <span class="font-mono">{item().assetId}</span>.</p><div class="mt-2 flex gap-2"><button type="button" class="rounded-lg bg-red-700 px-3 py-1.5 text-xs text-white" onClick={() => { setConfirmUseItemId(undefined); void submitTF2Operation("tf2.items.use", { game: "tf2", itemId: item().assetId, confirmed: true }); }}>Confirm permanent use</button><button type="button" class="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300" onClick={() => setConfirmUseItemId(undefined)}>Cancel</button></div></div></Show>
			<Show when={selectedTF2Details()?.itemKind === "container"}><p class="text-xs text-slate-500">TF2 unboxing remains capture-gated. Enabling its permanent-action flag does not bypass the backend protocol-evidence block.</p></Show>
			<Show when={selectedTF2Details()?.itemKind === "container" && selectedTF2Details()?.containerItems?.length}><details class="rounded-xl border border-slate-800 p-3"><summary class="cursor-pointer text-sm font-medium text-slate-300">Possible schema contents ({selectedTF2Details()?.containerItems?.length})</summary><ul class="mt-2 max-h-52 space-y-1 overflow-y-auto text-xs text-slate-400"><For each={selectedTF2Details()?.containerItems}>{(entry) => <li class="grid grid-cols-[2rem_1fr_auto] items-center gap-2"><Show when={entry.imageUrl} fallback={<div class="grid h-8 w-8 place-items-center rounded bg-slate-900 text-slate-600">?</div>}>{(url) => <img class="h-8 w-8 rounded bg-slate-900 object-contain" src={url()} alt="" loading="lazy" referrerpolicy="no-referrer" />}</Show><span>{entry.name}</span><span>{entry.poolKind === "unresolved" ? "unresolved" : entry.rarity || "unknown rarity"}</span></li>}</For></ul><p class="mt-2 text-xs text-slate-500">Possible contents only. Exact odds and bonus-drop behavior are not inferred.</p></details></Show>
			<Show when={props.settings?.featureFlags.enableTf2Unboxing && selectedTF2Details()?.itemKind === "container" && selectedTF2Details()?.containerItems?.some((entry) => entry.poolKind !== "unresolved")}><button type="button" class="w-full rounded-xl border border-violet-500/40 bg-violet-950/30 px-3 py-2 text-sm text-violet-100" onClick={previewTF2Container}>Preview unboxing animation</button><p class="text-xs text-slate-500">Offline preview only; no item is consumed or awarded.</p></Show>
			<Show when={operationStatus()}><p class="text-xs text-slate-400">{operationStatus()}</p></Show>
		  </div></Show>
		  <Show when={selectedTF2Item()}>{(tf2Item) => <div class="mt-4"><TF2ItemDiagnostics item={tf2Item()} /></div>}</Show>
		  <Show when={selectedSteamItem()}>{(steamItem) => <div class="mt-4"><SteamItemDiagnostics item={steamItem()} priceScan={selectedPriceScan()} priceScanLoading={selectedPriceScanLoading()} /></div>}</Show>
          <Show when={item().marketName && item().marketable}><a class="mt-4 inline-block text-sm font-medium text-sky-300 underline underline-offset-4" href={marketURL(item())} target="_blank" rel="noreferrer">Open exact Steam listing ↗</a></Show>
          <Show when={selectedInventoryURL()}>{(viewURL) => <div class="mt-3 grid gap-2 sm:grid-cols-2">
			<a class="block w-full rounded-xl border border-sky-500/40 bg-sky-950/30 px-4 py-3 text-center text-sm font-semibold text-sky-100 hover:bg-sky-900/40" href={viewURL()} target="_blank" rel="noopener noreferrer">View in inventory ↗</a>
			<Show when={selectedSaleURL()}>{(url) => <a class="block w-full rounded-xl border border-emerald-500/40 bg-emerald-950/30 px-4 py-3 text-center text-sm font-semibold text-emerald-100 hover:bg-emerald-900/40" href={url()} target="_blank" rel="noopener noreferrer">Sell on Steam ↗</a>}</Show>
		  </div>}</Show>
          <Show when={item().descriptions?.length}><div class="mt-4 space-y-2 border-t border-slate-800 pt-4 text-sm text-slate-400"><For each={item().descriptions}>{(line) => <p>{line}</p>}</For></div></Show>
        </div>}</Show>
      </aside>
    </div>
	<RevealAnimation open={!!tf2ContainerPreview()} ready mode={props.settings?.animations?.container ?? "slot-machine"} title="TF2 unboxing preview" candidates={tf2ContainerPreview()?.candidates ?? []} result={tf2ContainerPreview()?.result ?? { name: "TF2 item" }} onComplete={() => setTF2ContainerPreview(undefined)} />
  </div>;
}
