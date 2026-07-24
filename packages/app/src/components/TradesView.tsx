import { createMemo, createSignal, For, Show } from "solid-js";
import type { SteamAccountTradesCollection, SteamTradeDto, SteamTradeItemDto, SteamTradesSnapshot } from "@cs-inv-edit/contracts";
import { Alert } from "./ui/Alert.js";
import { Button } from "./ui/Button.js";
import { Card } from "./ui/Card.js";

const stateLabel = (state: string) => state.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
const dateLabel = (value?: string) => value ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "Unknown date";

function ItemTile(props: { item: SteamTradeItemDto }) {
  return <div class="flex min-w-0 items-center gap-3 rounded-xl border border-slate-800/80 bg-slate-950/70 p-2.5">
    <div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-slate-900">
      <Show when={props.item.imageUrl} fallback={<span class="text-xs text-slate-600">No image</span>}><img class="h-11 w-11 object-contain" src={props.item.imageUrl} alt="" loading="lazy" /></Show>
    </div>
    <div class="min-w-0"><p class="truncate text-sm font-medium text-slate-100">{props.item.marketName || props.item.name || `Asset ${props.item.assetId}`}</p><p class="truncate text-xs text-slate-500">{props.item.type || `App ${props.item.appId}`}<Show when={props.item.amount > 1}> · ×{props.item.amount}</Show></p></div>
  </div>;
}

function TradeSide(props: { title: string; items: SteamTradeItemDto[]; tone: "give" | "receive" }) {
  return <div class={`rounded-2xl border p-3 ${props.tone === "receive" ? "border-emerald-400/20 bg-emerald-400/[0.04]" : "border-amber-400/20 bg-amber-400/[0.04]"}`}>
    <div class="mb-2 flex items-center justify-between"><h3 class="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">{props.title}</h3><span class="rounded-full bg-slate-900 px-2 py-0.5 text-xs text-slate-400">{props.items.length}</span></div>
    <Show when={props.items.length} fallback={<p class="rounded-xl border border-dashed border-slate-800 p-4 text-center text-xs text-slate-500">Nothing</p>}><div class="grid gap-2 sm:grid-cols-2 xl:grid-cols-3"><For each={props.items}>{(item) => <ItemTile item={item} />}</For></div></Show>
  </div>;
}

function TradeCard(props: { trade: SteamTradeDto; historical?: boolean; accountName?: string }) {
  const active = () => props.trade.state === "active" || props.trade.state === "confirmation_required";
  const profileURL = () => props.trade.partnerProfileUrl || `https://steamcommunity.com/profiles/${props.trade.partnerSteamId}`;
  return <Card class="overflow-hidden p-0">
    <div class="flex flex-wrap items-start justify-between gap-3 border-b border-slate-800/80 px-4 py-3">
      <div class="flex min-w-0 items-center gap-3">
        <a class="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-700 bg-slate-900 text-sm font-semibold text-slate-400 transition hover:border-cyan-400/60" href={profileURL()} target="_blank" rel="noopener noreferrer" aria-label={`Open ${props.trade.partnerName || props.trade.partnerSteamId} on Steam`}>
          <Show when={props.trade.partnerAvatarUrl} fallback={(props.trade.partnerName || "?").slice(0, 1).toUpperCase()}><img class="h-full w-full object-cover" src={props.trade.partnerAvatarUrl} alt="" loading="lazy" /></Show>
        </a>
        <div class="min-w-0"><a class="block truncate font-semibold text-cyan-200 hover:text-cyan-100 hover:underline" href={profileURL()} target="_blank" rel="noopener noreferrer">{props.trade.partnerName || "Steam user"}</a><p class="truncate font-mono text-[11px] text-slate-500">{props.trade.partnerSteamId}</p><div class="mt-1 flex flex-wrap items-center gap-2"><Show when={props.accountName}><span class="rounded-full bg-violet-400/15 px-2.5 py-1 text-xs font-semibold text-violet-200">{props.accountName}</span></Show><span class={`rounded-full px-2.5 py-1 text-xs font-semibold ${active() ? "bg-cyan-400/15 text-cyan-200" : props.trade.state === "accepted" ? "bg-emerald-400/15 text-emerald-200" : "bg-slate-800 text-slate-300"}`}>{stateLabel(props.trade.state || "unknown")}</span><span class="font-mono text-xs text-slate-500">Trade #{props.trade.id}</span></div></div>
      </div>
      <div class="text-right text-xs text-slate-500"><p>{dateLabel(props.trade.updatedAt || props.trade.createdAt)}</p><Show when={active() && props.trade.expiresAt}><p class="mt-1 text-amber-300">Expires {dateLabel(props.trade.expiresAt)}</p></Show></div>
    </div>
    <Show when={props.trade.message}><blockquote class="mx-4 mt-3 rounded-xl border-l-2 border-cyan-400/40 bg-slate-900/60 px-3 py-2 text-sm text-slate-300">“{props.trade.message}”</blockquote></Show>
    <div class="grid gap-3 p-4 xl:grid-cols-2"><TradeSide title="You give" tone="give" items={props.trade.itemsToGive} /><TradeSide title="You receive" tone="receive" items={props.trade.itemsToReceive} /></div>
    <Show when={!props.historical && active()}><div class="flex justify-end border-t border-slate-800/80 px-4 py-3"><a class="rounded-lg border border-cyan-400/30 bg-cyan-400/10 px-3 py-2 text-sm font-semibold text-cyan-200 hover:bg-cyan-400/20" href={`https://steamcommunity.com/tradeoffer/${props.trade.id}/`} target="_blank" rel="noopener noreferrer">Review safely on Steam ↗</a></div></Show>
  </Card>;
}

export function TradesView(props: { snapshot?: SteamTradesSnapshot; accounts?: SteamAccountTradesCollection; activeSteamId?: string; onRefresh: (steamId?: string) => Promise<unknown>; onReconnect: () => void }) {
  const [tab, setTab] = createSignal<"received" | "sent" | "history">("received");
  const [accountScope, setAccountScope] = createSignal("all");
  const [busy, setBusy] = createSignal(false);
  const history = createMemo(() => (props.accounts?.accounts ?? []).filter((account) => accountScope() === "all" || account.steamId === accountScope()).flatMap((account) => account.snapshot.history.map((trade) => ({ trade, accountName: account.accountName }))));
  const trades = createMemo(() => tab() === "history" ? history() : (props.snapshot?.[tab()] ?? []).map((trade) => ({ trade, accountName: undefined })));
  const refresh = async () => { setBusy(true); await props.onRefresh(tab() === "history" && accountScope() !== "all" ? accountScope() : undefined); setBusy(false); };
  const tabs = [{ id: "received", label: "Incoming", count: () => props.snapshot?.received.length ?? 0 }, { id: "sent", label: "Outgoing", count: () => props.snapshot?.sent.length ?? 0 }, { id: "history", label: "History", count: () => history().length }] as const;
  return <div class="flex h-full min-h-0 w-full flex-col">
    <div class="mb-3 flex flex-wrap items-center justify-between gap-3"><h1 class="text-2xl font-semibold text-white">Trades</h1><div class="flex items-center gap-2"><Show when={tab() === "history"}><label class="text-sm text-slate-400">Account <select class="ml-2 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100" value={accountScope()} onChange={(event) => setAccountScope(event.currentTarget.value)}><option value="all">All available accounts</option><For each={props.accounts?.accounts ?? []}>{(account) => <option value={account.steamId}>{account.accountName}</option>}</For></select></label></Show><Button disabled={busy()} onClick={() => void refresh()}>{busy() ? "Refreshing…" : "Refresh trades"}</Button></div></div>
    <Show when={props.snapshot?.status === "requires_connection"}><Alert><p>Connect a Steam account to view its trade offers.</p><Button class="mt-3" onClick={props.onReconnect}>Connect account</Button></Alert></Show>
    <Show when={props.snapshot?.status === "requires_reauthentication"}><Alert variant="warning"><p>{props.snapshot?.message}</p><Button class="mt-3" onClick={props.onReconnect}>Sign in again</Button></Alert></Show>
    <Show when={props.snapshot?.status === "error"}><Alert variant="danger">{props.snapshot?.message || "Steam could not load trades."}</Alert></Show>
    <div class="mt-4 flex gap-1 overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/60 p-1"><For each={tabs}>{(entry) => <button class={`flex min-w-fit flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition ${tab() === entry.id ? "bg-slate-800 text-white shadow" : "text-slate-400 hover:text-slate-200"}`} onClick={() => setTab(entry.id)}>{entry.label}<span class="rounded-full bg-slate-950/70 px-2 py-0.5 text-xs">{entry.count()}</span></button>}</For></div>
    <div class="mt-4 min-h-0 flex-1 overflow-y-auto pr-1"><Show when={trades().length} fallback={<div class="rounded-2xl border border-dashed border-slate-700/80 px-6 py-14 text-center"><p class="text-lg font-medium text-slate-300">No {tab() === "history" ? "trade history" : `${tab()} offers`}</p><p class="mt-2 text-sm text-slate-500">{tab() === "history" ? "Recent completed and failed trades will appear here." : "There are no active offers in this direction."}</p></div>}><div class="space-y-4 pb-4"><For each={trades()}>{(entry) => <TradeCard trade={entry.trade} accountName={entry.accountName} historical={tab() === "history"} />}</For></div></Show></div>
  </div>;
}
