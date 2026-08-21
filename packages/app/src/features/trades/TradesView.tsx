import { createMemo, createSignal, For, Show } from "solid-js";
import type {
  SteamAccountTradesCollection,
  SteamTradeDto,
  SteamTradeItemDto,
  SteamTradesSnapshot,
} from "@cs-inv-edit/contracts";
import { Alert } from "../../shared/ui/Alert.js";
import { Button } from "../../shared/ui/Button.js";
import { SegmentedControl } from "../../shared/ui/SegmentedControl.js";
import { Card } from "../../shared/ui/Card.js";
import { TradeItemTile } from "./trade-item-tile.js";

const stateLabel = (state: string) =>
  state.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
const dateLabel = (value?: string) =>
  value
    ? new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value))
    : "Unknown date";

function TradeSide(props: {
  title: string;
  items: SteamTradeItemDto[];
  tone: "give" | "receive";
}) {
  return (
    <div
      class={`rounded-2xl border p-3 ${props.tone === "receive" ? "border-emerald-400/20 bg-emerald-950" : "border-amber-400/20 bg-amber-950"}`}
    >
      <div class="mb-2 flex items-center justify-between">
        <h3 class="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
          {props.title}
        </h3>
        <span class="rounded-full bg-slate-900 px-2 py-0.5 text-xs text-slate-400">
          {props.items.length}
        </span>
      </div>
      <Show
        when={props.items.length}
        fallback={
          <p class="rounded-xl border border-dashed border-slate-800 p-4 text-center text-xs text-slate-500">
            Nothing
          </p>
        }
      >
        <div class="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          <For each={props.items}>
            {(item) => <TradeItemTile item={item} />}
          </For>
        </div>
      </Show>
    </div>
  );
}

function AccountBadge(props: { name: string }) {
  return (
    <span class="rounded-full bg-violet-950 px-2.5 py-1 text-xs font-semibold text-violet-200">
      {props.name}
    </span>
  );
}

function TradePartner(props: {
  trade: SteamTradeDto;
  accountName?: string;
  profileUrl: string;
  active: boolean;
}) {
  const initials = () =>
    (props.trade.partnerName || "?").slice(0, 1).toUpperCase();
  return (
    <div class="flex min-w-0 items-center gap-3">
      <a
        class="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-700 bg-slate-900 text-sm font-semibold text-slate-400 transition hover:border-cyan-400/60"
        href={props.profileUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Open ${props.trade.partnerName || props.trade.partnerSteamId} on Steam`}
      >
        <Show when={props.trade.partnerAvatarUrl} fallback={initials()}>
          <img
            class="h-full w-full object-cover"
            src={props.trade.partnerAvatarUrl}
            alt=""
            loading="lazy"
          />
        </Show>
      </a>
      <div class="min-w-0">
        <a
          class="block truncate font-semibold text-cyan-200 hover:text-cyan-100 hover:underline"
          href={props.profileUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          {props.trade.partnerName || "Steam user"}
        </a>
        <p class="truncate font-mono text-[11px] text-slate-500">
          {props.trade.partnerSteamId}
        </p>
        <div class="mt-1 flex flex-wrap items-center gap-2">
          <Show when={props.accountName} keyed>
            {(name) => <AccountBadge name={name} />}
          </Show>
          <span
            class={`rounded-full px-2.5 py-1 text-xs font-semibold ${props.active ? "bg-cyan-950 text-cyan-200" : props.trade.state === "accepted" ? "bg-emerald-950 text-emerald-200" : "bg-slate-800 text-slate-300"}`}
          >
            {stateLabel(props.trade.state || "unknown")}
          </span>
          <span class="font-mono text-xs text-slate-500">
            Trade #{props.trade.id}
          </span>
        </div>
      </div>
    </div>
  );
}

function TradeCard(props: {
  trade: SteamTradeDto;
  historical?: boolean;
  accountName?: string;
}) {
  const active = () =>
    props.trade.state === "active" ||
    props.trade.state === "confirmation_required";
  const profileUrl = () =>
    props.trade.partnerProfileUrl ||
    `https://steamcommunity.com/profiles/${props.trade.partnerSteamId}`;
  return (
    <Card class="overflow-hidden p-0">
      <div class="flex flex-wrap items-start justify-between gap-3 border-b border-slate-800/80 px-4 py-3">
        <TradePartner
          trade={props.trade}
          accountName={props.accountName}
          profileUrl={profileUrl()}
          active={active()}
        />
        <div class="text-right text-xs text-slate-500">
          <p>{dateLabel(props.trade.updatedAt || props.trade.createdAt)}</p>
          <Show when={active() && props.trade.expiresAt}>
            <p class="mt-1 text-amber-300">
              Expires {dateLabel(props.trade.expiresAt)}
            </p>
          </Show>
        </div>
      </div>
      <Show when={props.trade.message}>
        <blockquote class="mx-4 mt-3 rounded-xl border-l-2 border-cyan-400/40 bg-slate-900 px-3 py-2 text-sm text-slate-300">
          “{props.trade.message}”
        </blockquote>
      </Show>
      <div class="grid gap-3 p-4 xl:grid-cols-2">
        <TradeSide
          title="You give"
          tone="give"
          items={props.trade.itemsToGive}
        />
        <TradeSide
          title="You receive"
          tone="receive"
          items={props.trade.itemsToReceive}
        />
      </div>
      <Show when={!props.historical && active()}>
        <div class="flex justify-end border-t border-slate-800/80 px-4 py-3">
          <a
            class="rounded-lg border border-cyan-400/30 bg-cyan-950 px-3 py-2 text-sm font-semibold text-cyan-200 hover:bg-cyan-950"
            href={`https://steamcommunity.com/tradeoffer/${props.trade.id}/`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Review safely on Steam ↗
          </a>
        </div>
      </Show>
    </Card>
  );
}

function TradesList(props: {
  trades: Array<{ trade: SteamTradeDto; accountName?: string }>;
  tab: "received" | "sent" | "history";
}) {
  const emptyState = () => {
    const label =
      props.tab === "history" ? "trade history" : `${props.tab} offers`;
    const description =
      props.tab === "history"
        ? "Recent completed and failed trades will appear here."
        : "There are no active offers in this direction.";

    return (
      <div class="rounded-2xl border border-dashed border-slate-700/80 px-6 py-14 text-center">
        <p class="text-lg font-medium text-slate-300">No {label}</p>
        <p class="mt-2 text-sm text-slate-500">{description}</p>
      </div>
    );
  };

  return (
    <Show when={props.trades.length} fallback={emptyState()}>
      <div class="space-y-4 pb-4">
        <For each={props.trades}>
          {(entry) => (
            <TradeCard
              trade={entry.trade}
              accountName={entry.accountName}
              historical={props.tab === "history"}
            />
          )}
        </For>
      </div>
    </Show>
  );
}

function TradesStatusAlerts(props: {
  snapshot?: SteamTradesSnapshot;
  onReconnect: () => void;
}) {
  return (
    <>
      <Show when={props.snapshot?.status === "requires_connection"}>
        <Alert>
          <p>Connect a Steam account to view its trade offers.</p>
          <Button class="mt-3" onClick={props.onReconnect}>
            Connect account
          </Button>
        </Alert>
      </Show>
      <Show when={props.snapshot?.status === "requires_reauthentication"}>
        <Alert variant="warning">
          <p>{props.snapshot?.message}</p>
          <Button class="mt-3" onClick={props.onReconnect}>
            Sign in again
          </Button>
        </Alert>
      </Show>
      <Show when={props.snapshot?.status === "error"}>
        <Alert variant="danger">
          {props.snapshot?.message || "Steam could not load trades."}
        </Alert>
      </Show>
    </>
  );
}

function TradeAccountOption(props: {
  account: SteamAccountTradesCollection["accounts"][number];
}) {
  return (
    <option value={props.account.steamId}>{props.account.accountName}</option>
  );
}

function TradeAccountOptions(props: {
  accounts: SteamAccountTradesCollection["accounts"];
}) {
  return (
    <For each={props.accounts}>
      {(account) => <TradeAccountOption account={account} />}
    </For>
  );
}

function TradesHeader(props: {
  tab: "received" | "sent" | "history";
  accountScope: string;
  accounts?: SteamAccountTradesCollection;
  busy: boolean;
  onTabChange: (value: "received" | "sent" | "history") => void;
  onAccountScopeChange: (value: string) => void;
  onRefresh: () => void;
}) {
  const changeAccount = (
    event: Event & { currentTarget: HTMLSelectElement },
  ) => {
    props.onAccountScopeChange(event.currentTarget.value);
  };
  return (
    <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
      <h1 class="text-2xl font-semibold text-white">Trades</h1>
      <div class="flex items-center gap-2">
        <Show when={props.tab === "history"}>
          <label class="text-sm text-slate-400">
            Account
            <select
              class="ml-2 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
              value={props.accountScope}
              onChange={changeAccount}
            >
              <option value="all">All available accounts</option>
              <TradeAccountOptions accounts={props.accounts?.accounts ?? []} />
            </select>
          </label>
        </Show>
        <Button disabled={props.busy} onClick={props.onRefresh}>
          {props.busy ? "Refreshing…" : "Refresh trades"}
        </Button>
      </div>
    </div>
  );
}

export function TradesView(props: {
  snapshot?: SteamTradesSnapshot;
  accounts?: SteamAccountTradesCollection;
  activeSteamId?: string;
  onRefresh: (steamId?: string) => Promise<unknown>;
  onReconnect: () => void;
}) {
  const [tab, setTab] = createSignal<"received" | "sent" | "history">(
    "received",
  );
  const [accountScope, setAccountScope] = createSignal("all");
  const [busy, setBusy] = createSignal(false);
  const history = createMemo(() =>
    (props.accounts?.accounts ?? [])
      .filter(
        (account) =>
          accountScope() === "all" || account.steamId === accountScope(),
      )
      .flatMap((account) =>
        account.snapshot.history.map((trade) => ({
          trade,
          accountName: account.accountName,
        })),
      ),
  );
  const trades = createMemo(() =>
    tab() === "history"
      ? history()
      : (props.snapshot?.[tab()] ?? []).map((trade) => ({
          trade,
          accountName: undefined,
        })),
  );
  const refresh = async () => {
    setBusy(true);
    await props.onRefresh(
      tab() === "history" && accountScope() !== "all"
        ? accountScope()
        : undefined,
    );
    setBusy(false);
  };
  const tabs = [
    {
      id: "received",
      label: "Incoming",
      count: () => props.snapshot?.received.length ?? 0,
    },
    {
      id: "sent",
      label: "Outgoing",
      count: () => props.snapshot?.sent.length ?? 0,
    },
    { id: "history", label: "History", count: () => history().length },
  ] as const;
  return (
    <div class="flex w-full flex-1 flex-col">
      <TradesHeader
        tab={tab()}
        accountScope={accountScope()}
        accounts={props.accounts}
        busy={busy()}
        onTabChange={setTab}
        onAccountScopeChange={setAccountScope}
        onRefresh={() => void refresh()}
      />
      <TradesStatusAlerts
        snapshot={props.snapshot}
        onReconnect={props.onReconnect}
      />
      <SegmentedControl
        class="mt-4"
        label="Trade offer status"
        value={tab()}
        onChange={setTab}
        options={tabs.map((entry) => ({
          value: entry.id,
          label: entry.label,
          suffix: (
            <span class="rounded-full bg-slate-950 px-2 py-0.5 text-xs">
              {entry.count()}
            </span>
          ),
        }))}
      />
      <div class="mt-4 flex-1">
        <TradesList trades={trades()} tab={tab()} />
      </div>
    </div>
  );
}
