import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import type { EconomyGame, EconomyInventoryItemDto, GameInventorySnapshot, OperationReceipt, SettingsData } from "@cs-inv-edit/contracts";
import { Alert } from "./ui/Alert.js";
import { InventoryLoadingState } from "./ui/InventoryLoadingState.js";
import type { LoadingStage } from "./ui/LoadingProgress.js";
import { PullToRefresh } from "./ui/PullToRefresh.js";
import { calculateVirtualInventoryWindow, economyOutlineClass, gameFilterCategories, snapshotForGame } from "./game-inventory-utils.js";

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
  const [failed, setFailed] = createSignal(false);
  return <Show when={props.item.imageUrl && !failed()} fallback={<div class={`${props.large ? "h-40 w-full text-lg" : "h-20 w-full text-sm"} grid place-items-center rounded-xl bg-slate-950 font-semibold text-slate-600`}>{props.item.name.slice(0, 2).toUpperCase()}</div>}>
    <img class={`${props.large ? "h-40" : "h-20"} w-full rounded-xl bg-slate-950 object-contain`} src={props.item.imageUrl} alt={props.item.name} loading="lazy" referrerpolicy="no-referrer" onError={() => setFailed(true)} />
  </Show>;
}

export function GameInventoryView(props: { game: EconomyGame; snapshot?: GameInventorySnapshot; connected?: boolean; settings?: SettingsData; query: string; selectedAssetId?: string; setSelectedAssetId: (id: string | undefined) => void; compactMode: "icons" | "concise" | "detailed"; onRefresh: () => void; onOperation?: (type: string, input: unknown) => Promise<OperationReceipt> }) {
	const [tagFilter, setTagFilter] = createSignal("");
	const [scrollTop, setScrollTop] = createSignal(0);
	const [viewport, setViewport] = createSignal({ width: 800, height: 600 });
	const [operationStatus, setOperationStatus] = createSignal("");
	const [confirmUseItemId, setConfirmUseItemId] = createSignal<string>();
	let gridViewport: HTMLDivElement | undefined;
	const snapshot = () => snapshotForGame(props.game, props.snapshot);
	const title = () => props.game === "steam" ? "Steam Inventory" : props.game === "tf2" ? "Team Fortress 2 Inventory" : "Dota 2 Inventory";
	let filterGame = props.game;
	let loggedDiagnostics = "";
	createEffect(() => {
		const nextGame = props.game;
		if (nextGame !== filterGame) setTagFilter("");
		filterGame = nextGame;
	});
	createEffect(() => {
		const lines = snapshot()?.diagnostics ?? [];
		const key = `${props.game}\u0000${lines.join("\u0000")}`;
		if (lines.length === 0 || loggedDiagnostics === key) return;
		loggedDiagnostics = key;
		console.groupCollapsed(`[${props.game} inventory] metadata diagnostics`);
		for (const line of lines) console.info(line);
		console.groupEnd();
	});
	const filterOptions = createMemo(() => {
		const allowed = gameFilterCategories(props.game);
		const options = new Map<string, string>();
		for (const item of snapshot()?.items ?? []) {
			for (const tag of item.tags) {
				const category = tag.category.toLowerCase();
				if (allowed.has(category)) options.set(`${category}\u0000${tag.internalName}`, `${tag.category}: ${tag.name}`);
			}
		}
		return [...options].sort((left, right) => left[1].localeCompare(right[1]));
	});
  const items = createMemo(() => {
    const query = props.query.trim().toLowerCase();
		const [filterCategory, filterName] = tagFilter().split("\u0000");
		return (snapshot()?.items ?? []).filter((item) => {
			const queryMatches = !query || `${item.name} ${item.marketName ?? ""} ${item.type ?? ""} ${item.rarity ?? ""} ${item.quality ?? ""}`.toLowerCase().includes(query);
			const tagMatches = !filterCategory || item.tags.some((tag) => tag.category.toLowerCase() === filterCategory && tag.internalName === filterName);
			return queryMatches && tagMatches;
		});
  });
	const selected = createMemo(() => items().find((item) => item.assetId === props.selectedAssetId) ?? items()[0]);
	const selectedTF2Details = createMemo(() => {
		const item = selected();
		return item?.game === "tf2" ? item.details : undefined;
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
	onMount(() => {
		if (!gridViewport) return;
		const update = () => setViewport({ width: gridViewport?.clientWidth ?? 800, height: gridViewport?.clientHeight ?? 600 });
		update();
		const observer = new ResizeObserver(update);
		observer.observe(gridViewport);
		onCleanup(() => observer.disconnect());
	});

  return <div class="flex min-h-0 flex-1 flex-col gap-4">
	<Show when={filterOptions().length}><div class="flex items-center justify-end"><label><span class="sr-only">Inventory item filter</span><select class="h-9 max-w-64 rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm text-slate-200" value={tagFilter()} onInput={(event) => setTagFilter(event.currentTarget.value)}><option value="">All item categories</option><For each={filterOptions()}>{([value, label]) => <option value={value}>{label}</option>}</For></select></label></div></Show>
	<Show when={snapshot()?.status === "requires_connection" && props.connected === false}><Alert variant="warning">Connect a Steam account, then refresh this inventory.</Alert></Show>
	<Show when={snapshot()?.status === "error"}><Alert variant="danger">{snapshot()?.error || "Inventory loading failed"}</Alert></Show>
    <div class="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <PullToRefresh ref={(element) => { gridViewport = element; }} class="min-h-0 overflow-y-auto pr-1" onRefresh={props.onRefresh} onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}>
		<div class="relative" style={{ height: `${virtualGrid().totalRows * virtualGrid().rowHeight}px` }}>
		<div class="absolute inset-x-0 grid gap-3" style={{ transform: `translateY(${virtualGrid().firstRow * virtualGrid().rowHeight}px)`, "grid-template-columns": `repeat(${virtualGrid().columns}, minmax(0, 1fr))` }}>
		<For each={virtualGrid().visibleItems}>{(item) => <button type="button" style={{ height: props.compactMode === "icons" ? "104px" : "146px" }} class={`rounded-2xl border p-3 text-left transition ${economyOutlineClass(item)} ${selected()?.assetId === item.assetId ? "ring-2 ring-cyan-300 bg-cyan-950/30" : "bg-slate-900/70 hover:brightness-110"}`} onClick={() => props.setSelectedAssetId(item.assetId)}>
          <ItemImage item={item} />
          <Show when={props.compactMode !== "icons"}><p class="mt-2 line-clamp-2 text-sm font-medium text-slate-100">{item.name}</p><Show when={item.quantity > 1}><p class="mt-1 text-xs text-slate-400">Quantity {item.quantity}</p></Show></Show>
        </button>}</For>
		</div></div>
		<Show when={snapshot()?.status === "loading" && items().length === 0}>
			<InventoryLoadingState active title={`Loading ${title()}`} stages={economyInventoryLoadingStages[props.game]} currentStage={snapshot()?.message} />
		</Show>
		<Show when={snapshot()?.status === "ready" && items().length === 0}><p class="rounded-2xl border border-slate-800 p-5 text-sm text-slate-400">No matching items.</p></Show>
      </PullToRefresh>
      <aside class="min-h-0 overflow-y-auto rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
        <Show when={selected()} fallback={<p class="text-sm text-slate-400">Select an item to inspect it.</p>}>{(item) => <div>
          <ItemImage item={item()} large />
          <h2 class="mt-3 text-xl font-semibold text-slate-50">{item().name}</h2>
          <Show when={item().type}><p class="mt-1 text-sm text-slate-400">{item().type}</p></Show>
          <dl class="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-1">
            <Show when={item().rarity}><div><dt class="text-xs uppercase tracking-wide text-slate-500">Rarity</dt><dd class="mt-1 text-slate-200">{item().rarity}</dd></div></Show>
            <Show when={item().quality}><div><dt class="text-xs uppercase tracking-wide text-slate-500">Quality</dt><dd class="mt-1 text-slate-200">{item().quality}</dd></div></Show>
            <div><dt class="text-xs uppercase tracking-wide text-slate-500">Trade state</dt><dd class="mt-1 text-slate-200">{item().tradable ? "Tradable" : "Not tradable"} · {item().marketable ? "Marketable" : "Not marketable"}</dd></div>
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
		  <Show when={Object.keys(item().details.attributes).length}><details class="mt-4 border-t border-slate-800 pt-4"><summary class="cursor-pointer text-sm font-medium text-slate-300">Raw economy attributes ({Object.keys(item().details.attributes).length})</summary><dl class="mt-2 grid gap-1 font-mono text-xs text-slate-400"><For each={Object.entries(item().details.attributes)}>{([id, value]) => <div class="flex justify-between gap-3"><dt>{id}</dt><dd>{value}</dd></div>}</For></dl></details></Show>
		  <Show when={Object.keys(item().details.attributeBytes ?? {}).length}><details class="mt-3"><summary class="cursor-pointer text-sm font-medium text-slate-300">Binary/socket attributes ({Object.keys(item().details.attributeBytes ?? {}).length})</summary><dl class="mt-2 grid gap-1 font-mono text-xs text-slate-400"><For each={Object.entries(item().details.attributeBytes ?? {})}>{([id, value]) => <div class="grid grid-cols-[auto_1fr] gap-3"><dt>{id}</dt><dd class="break-all text-right">{value}</dd></div>}</For></dl></details></Show>
		  <Show when={item().details.equippedStates?.length}><p class="mt-3 text-xs text-slate-400">Equipped states: {item().details.equippedStates?.map((state) => `class ${state.class}, slot ${state.slot}`).join(" · ")}</p></Show>
		  <Show when={item().details.interiorItemId}><p class="mt-2 text-xs text-slate-400">Contained economy item: <span class="font-mono">{item().details.interiorItemId}</span></p></Show>
		  <Show when={selectedTF2Details()?.description}><p class="mt-3 text-sm text-slate-400">{selectedTF2Details()?.description}</p></Show>
		  <Show when={item().game === "tf2"}><div class="mt-4 space-y-2 border-t border-slate-800 pt-4">
			<Show when={props.settings?.featureFlags.enableTf2ItemUse && confirmUseItemId() !== item().assetId}><button type="button" class="w-full rounded-xl border border-amber-500/40 bg-amber-950/30 px-3 py-2 text-sm text-amber-100" onClick={() => setConfirmUseItemId(item().assetId)}>Use TF2 item</button></Show>
			<Show when={props.settings?.featureFlags.enableTf2ItemUse && confirmUseItemId() === item().assetId}><div class="rounded-xl border border-red-500/40 bg-red-950/30 p-3"><p class="text-xs text-red-100">This permanently consumes or changes {item().name}. Confirm the exact item ID <span class="font-mono">{item().assetId}</span>.</p><div class="mt-2 flex gap-2"><button type="button" class="rounded-lg bg-red-700 px-3 py-1.5 text-xs text-white" onClick={() => { setConfirmUseItemId(undefined); void submitTF2Operation("tf2.items.use", { game: "tf2", itemId: item().assetId, confirmed: true }); }}>Confirm permanent use</button><button type="button" class="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300" onClick={() => setConfirmUseItemId(undefined)}>Cancel</button></div></div></Show>
			<Show when={selectedTF2Details()?.itemKind === "container"}><p class="text-xs text-slate-500">TF2 unboxing remains capture-gated. Enabling its permanent-action flag does not bypass the backend protocol-evidence block.</p></Show>
			<Show when={operationStatus()}><p class="text-xs text-slate-400">{operationStatus()}</p></Show>
		  </div></Show>
          <Show when={item().marketName && item().marketable}><a class="mt-4 inline-block text-sm font-medium text-sky-300 underline underline-offset-4" href={marketURL(item())} target="_blank" rel="noreferrer">Open exact Steam listing ↗</a></Show>
          <Show when={item().descriptions?.length}><div class="mt-4 space-y-2 border-t border-slate-800 pt-4 text-sm text-slate-400"><For each={item().descriptions}>{(line) => <p>{line}</p>}</For></div></Show>
        </div>}</Show>
      </aside>
    </div>
  </div>;
}
