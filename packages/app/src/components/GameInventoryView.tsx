import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import type { EconomyGame, EconomyInventoryItemDto, GameInventorySnapshot } from "@cs-inv-edit/contracts";
import { Alert } from "./ui/Alert.js";
import { Button } from "./ui/Button.js";
import { calculateVirtualInventoryWindow, economyOutlineClass, gameFilterCategories, snapshotForGame } from "./game-inventory-utils.js";

function marketURL(item: EconomyInventoryItemDto) {
  return `https://steamcommunity.com/market/listings/${item.appId}/${encodeURIComponent(item.marketName ?? "")}`;
}

function ItemImage(props: { item: EconomyInventoryItemDto; large?: boolean }) {
  const [failed, setFailed] = createSignal(false);
  return <Show when={props.item.imageUrl && !failed()} fallback={<div class={`${props.large ? "h-40 w-full text-lg" : "h-20 w-full text-sm"} grid place-items-center rounded-xl bg-slate-950 font-semibold text-slate-600`}>{props.item.name.slice(0, 2).toUpperCase()}</div>}>
    <img class={`${props.large ? "h-40" : "h-20"} w-full rounded-xl bg-slate-950 object-contain`} src={props.item.imageUrl} alt={props.item.name} loading="lazy" referrerpolicy="no-referrer" onError={() => setFailed(true)} />
  </Show>;
}

export function GameInventoryView(props: { game: EconomyGame; snapshot?: GameInventorySnapshot; query: string; selectedAssetId?: string; setSelectedAssetId: (id: string | undefined) => void; compactMode: "icons" | "concise" | "detailed"; onRefresh: () => void }) {
	const [tagFilter, setTagFilter] = createSignal("");
	const [scrollTop, setScrollTop] = createSignal(0);
	const [viewport, setViewport] = createSignal({ width: 800, height: 600 });
	let gridViewport: HTMLDivElement | undefined;
	const snapshot = () => snapshotForGame(props.game, props.snapshot);
	const title = () => props.game === "steam" ? "Steam Inventory" : props.game === "tf2" ? "Team Fortress 2 Inventory" : "Dota 2 Inventory";
	let filterGame = props.game;
	createEffect(() => {
		const nextGame = props.game;
		if (nextGame !== filterGame) setTagFilter("");
		filterGame = nextGame;
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
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div><h1 class="text-2xl font-semibold text-slate-50">{title()}</h1><p class="mt-1 text-sm text-slate-400">Read-only economy inventory · {snapshot()?.items.length ?? 0} assets</p><Show when={snapshot()}>{(value) => <p class="mt-1 text-xs text-slate-500">Last refresh: {new Date(value().refreshedAt).toLocaleString()}<Show when={value().schemaRevision}> · Schema: <span class="font-mono">{value().schemaRevision}</span></Show></p>}</Show></div>
		<div class="flex items-center gap-2"><Show when={filterOptions().length}><label><span class="sr-only">Inventory item filter</span><select class="h-9 max-w-64 rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm text-slate-200" value={tagFilter()} onInput={(event) => setTagFilter(event.currentTarget.value)}><option value="">All item categories</option><For each={filterOptions()}>{([value, label]) => <option value={value}>{label}</option>}</For></select></label></Show><Button onClick={props.onRefresh}>Refresh</Button></div>
    </div>
	<Show when={snapshot()?.status === "requires_connection"}><Alert variant="warning">Connect a Steam account, then refresh this inventory.</Alert></Show>
	<Show when={snapshot()?.status === "loading"}><Alert>Loading {title()}…</Alert></Show>
	<Show when={snapshot()?.status === "error"}><Alert variant="danger">{snapshot()?.error || "Inventory loading failed"}</Alert></Show>
	<For each={snapshot()?.diagnostics}>{(line) => <Alert variant="warning">{line}</Alert>}</For>
    <div class="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div ref={(element) => { gridViewport = element; }} class="min-h-0 overflow-y-auto pr-1" onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}>
		<div class="relative" style={{ height: `${virtualGrid().totalRows * virtualGrid().rowHeight}px` }}>
		<div class="absolute inset-x-0 grid gap-3" style={{ transform: `translateY(${virtualGrid().firstRow * virtualGrid().rowHeight}px)`, "grid-template-columns": `repeat(${virtualGrid().columns}, minmax(0, 1fr))` }}>
		<For each={virtualGrid().visibleItems}>{(item) => <button type="button" style={{ height: props.compactMode === "icons" ? "104px" : "146px" }} class={`rounded-2xl border p-3 text-left transition ${economyOutlineClass(item)} ${selected()?.assetId === item.assetId ? "ring-2 ring-cyan-300 bg-cyan-950/30" : "bg-slate-900/70 hover:brightness-110"}`} onClick={() => props.setSelectedAssetId(item.assetId)}>
          <ItemImage item={item} />
          <Show when={props.compactMode !== "icons"}><p class="mt-2 line-clamp-2 text-sm font-medium text-slate-100">{item.name}</p><Show when={item.quantity > 1}><p class="mt-1 text-xs text-slate-400">Quantity {item.quantity}</p></Show></Show>
        </button>}</For>
		</div></div>
		<Show when={snapshot()?.status === "ready" && items().length === 0}><p class="rounded-2xl border border-slate-800 p-5 text-sm text-slate-400">No matching items.</p></Show>
      </div>
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
			<Show when={item().game === "dota2" && item().details.game === "dota2" && item().details.hero}><div><dt class="text-xs uppercase tracking-wide text-slate-500">Hero</dt><dd class="mt-1 text-slate-200">{item().details.game === "dota2" ? item().details.hero : ""}</dd></div></Show>
			<Show when={item().game === "dota2" && item().details.game === "dota2" && item().details.slot}><div><dt class="text-xs uppercase tracking-wide text-slate-500">Slot</dt><dd class="mt-1 text-slate-200">{item().details.game === "dota2" ? item().details.slot : ""}</dd></div></Show>
          </dl>
		  <Show when={Object.keys(item().details.attributes).length}><details class="mt-4 border-t border-slate-800 pt-4"><summary class="cursor-pointer text-sm font-medium text-slate-300">Raw economy attributes ({Object.keys(item().details.attributes).length})</summary><dl class="mt-2 grid gap-1 font-mono text-xs text-slate-400"><For each={Object.entries(item().details.attributes)}>{([id, value]) => <div class="flex justify-between gap-3"><dt>{id}</dt><dd>{value}</dd></div>}</For></dl></details></Show>
		  <Show when={Object.keys(item().details.attributeBytes ?? {}).length}><details class="mt-3"><summary class="cursor-pointer text-sm font-medium text-slate-300">Binary/socket attributes ({Object.keys(item().details.attributeBytes ?? {}).length})</summary><dl class="mt-2 grid gap-1 font-mono text-xs text-slate-400"><For each={Object.entries(item().details.attributeBytes ?? {})}>{([id, value]) => <div class="grid grid-cols-[auto_1fr] gap-3"><dt>{id}</dt><dd class="break-all text-right">{value}</dd></div>}</For></dl></details></Show>
		  <Show when={item().details.equippedStates?.length}><p class="mt-3 text-xs text-slate-400">Equipped states: {item().details.equippedStates?.map((state) => `class ${state.class}, slot ${state.slot}`).join(" · ")}</p></Show>
		  <Show when={item().details.interiorItemId}><p class="mt-2 text-xs text-slate-400">Contained economy item: <span class="font-mono">{item().details.interiorItemId}</span></p></Show>
          <Show when={item().marketName && item().marketable}><a class="mt-4 inline-block text-sm font-medium text-sky-300 underline underline-offset-4" href={marketURL(item())} target="_blank" rel="noreferrer">Open exact Steam listing ↗</a></Show>
          <Show when={item().descriptions?.length}><div class="mt-4 space-y-2 border-t border-slate-800 pt-4 text-sm text-slate-400"><For each={item().descriptions}>{(line) => <p>{line}</p>}</For></div></Show>
        </div>}</Show>
      </aside>
    </div>
  </div>;
}
