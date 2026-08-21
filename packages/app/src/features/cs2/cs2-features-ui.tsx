import { For, Show } from "solid-js";
import type { InventorySnapshot } from "@cs-inv-edit/contracts";

export function Summary(props: {
  label: string;
  value: string;
  detail?: string;
  last?: boolean;
}) {
  return (
    <div
      class={`p-4 ${props.last ? "" : "border-b border-slate-800 sm:border-b-0 sm:border-r"}`}
    >
      <p class="text-xs font-medium text-slate-500">{props.label}</p>
      <p class="mt-1 text-xl font-semibold tabular-nums text-slate-100">
        {props.value}
      </p>
      <Show when={props.detail}>
        {(detail) => <p class="mt-1 text-xs text-slate-500">{detail()}</p>}
      </Show>
    </div>
  );
}

export function SectionTitle(props: { title: string }) {
  return (
    <h2 class="text-sm font-semibold uppercase tracking-[0.12em] text-slate-400">
      {props.title}
    </h2>
  );
}

export function EmptyState(props: { text: string }) {
  return <p class="p-5 text-sm leading-6 text-slate-500">{props.text}</p>;
}

function InfoRow(props: { title: string; value: string; detail?: string }) {
  return (
    <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 p-4">
      <div class="min-w-0">
        <p class="font-medium text-slate-100">{props.title}</p>
        <Show when={props.detail}>
          {(detail) => <p class="mt-1 text-xs text-slate-500">{detail()}</p>}
        </Show>
      </div>
      <p class="text-sm tabular-nums text-slate-300">{props.value}</p>
    </div>
  );
}

function SectionList(props: { children: import("solid-js").JSX.Element }) {
  return (
    <div class="mt-3 divide-y divide-slate-800 rounded-xl border border-slate-800 bg-slate-950">
      {props.children}
    </div>
  );
}

function MatchRow(props: {
  match: Record<string, unknown>;
  matchMap: (match: Record<string, unknown>) => string | undefined;
  finalRound: (
    match: Record<string, unknown>,
  ) => Record<string, unknown> | undefined;
  roundStats: (
    match: Record<string, unknown>,
  ) => Array<Record<string, unknown>>;
  numbers: (value: unknown) => number[];
  textValue: (value: unknown) => string | undefined;
  dateLabel: (value: unknown) => string | undefined;
}) {
  return (
    <div class="grid grid-cols-[1fr_auto] items-center gap-4 py-3">
      <div>
        <p class="font-medium text-slate-100">
          {props.matchMap(props.match) ?? "Recorded match"}
        </p>
        <p class="mt-1 text-xs text-slate-500">
          {props.numbers(props.finalRound(props.match)?.team_scores).length
            ? `Final score ${props.numbers(props.finalRound(props.match)?.team_scores).join("–")}`
            : `${props.roundStats(props.match).length} stat snapshots`}
          {props.textValue(props.finalRound(props.match)?.match_duration)
            ? ` · ${Math.round(Number(props.finalRound(props.match)?.match_duration) / 60)} min`
            : ""}
        </p>
      </div>
      <p class="text-sm text-slate-500">
        {props.dateLabel(props.match.matchtime) ?? "Date unavailable"}
      </p>
    </div>
  );
}

function Metric(props: { label: string; value: string }) {
  return (
    <div class="bg-slate-950 p-4">
      <p class="text-xs text-slate-500">{props.label}</p>
      <p class="mt-1 text-lg font-semibold tabular-nums text-slate-100">
        {props.value}
      </p>
    </div>
  );
}

export function ProfileDetailsSection(props: {
  rankings: Array<Record<string, unknown>>;
  commendation: Record<string, unknown> | undefined;
  xpShop: Record<string, unknown> | undefined;
  deepStatsMatches: unknown;
  penaltySeconds: unknown;
  vacBanned: unknown;
  textValue: (value: unknown) => string | undefined;
  dateLabel: (value: unknown) => string | undefined;
  records: (value: unknown) => Array<Record<string, unknown>>;
  record: (value: unknown) => Record<string, unknown> | undefined;
  numbers: (value: unknown) => number[];
}) {
  const rankingTitle = (ranking: Record<string, unknown>) =>
    props.textValue(ranking.leaderboard_name) ??
    `Competitive ranking ${props.textValue(ranking.rank_type_id) ?? ""}`.trim();
  const rankingDetail = (ranking: Record<string, unknown>) =>
    [
      props.textValue(ranking.wins) && `${props.textValue(ranking.wins)} wins`,
      props.textValue(ranking.highest_rank) &&
        `highest rank ${props.textValue(ranking.highest_rank)}`,
      props.dateLabel(ranking.rank_expiry) &&
        `expires ${props.dateLabel(ranking.rank_expiry)}`,
    ]
      .filter(Boolean)
      .join(" · ");
  return (
    <section>
      <SectionTitle title="Profile details" />
      <SectionList>
        <For each={props.rankings}>
          {(ranking) => (
            <InfoRow
              title={rankingTitle(ranking)}
              value={`Rank ${props.textValue(ranking.rank_id) ?? "—"}`}
              detail={rankingDetail(ranking)}
            />
          )}
        </For>
        <Show when={props.commendation}>
          {(value) => (
            <InfoRow
              title="Commendations"
              value={`${props.textValue(value().cmd_friendly) ?? 0} friendly · ${props.textValue(value().cmd_teaching) ?? 0} teacher · ${props.textValue(value().cmd_leader) ?? 0} leader`}
            />
          )}
        </Show>
        <Show when={props.xpShop}>
          {(shop) => (
            <InfoRow
              title="XP Shop"
              value={`${props.textValue(shop().redeemable_balance ?? props.record(shop().postmatch)?.redeemable_balance) ?? 0} redeemable`}
              detail={`${props.records(shop().xp_tracks).length || props.numbers(shop().xp_tracks).length} XP tracks`}
            />
          )}
        </Show>
        <Show when={props.records(props.deepStatsMatches).length > 0}>
          <InfoRow
            title="Detailed match history"
            value={`${props.records(props.deepStatsMatches).length} matches retained`}
          />
        </Show>
        <Show when={Number(props.penaltySeconds ?? 0) > 0}>
          <InfoRow
            title="Matchmaking penalty"
            value={`${props.penaltySeconds} seconds remaining`}
          />
        </Show>
        <Show when={Number(props.vacBanned ?? 0) !== 0}>
          <InfoRow title="VAC status" value="Restricted" />
        </Show>
      </SectionList>
    </section>
  );
}

export function PremierSeasonSection(props: {
  premier: string | undefined;
  premierTotals: {
    matches: number;
    wins: number;
    ties: number;
    losses: number;
    kills: number;
    deaths: number;
    headshots: number;
  };
}) {
  return (
    <section>
      <SectionTitle title={`Premier season ${props.premier ?? "summary"}`} />
      <div class="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-slate-800 bg-slate-800 sm:grid-cols-4">
        <Metric
          label="Record"
          value={`${props.premierTotals.wins}–${props.premierTotals.ties}–${props.premierTotals.losses}`}
        />
        <Metric label="Kills" value={String(props.premierTotals.kills)} />
        <Metric label="Deaths" value={String(props.premierTotals.deaths)} />
        <Metric
          label="Headshots"
          value={String(props.premierTotals.headshots)}
        />
      </div>
    </section>
  );
}

export function RecentMatchesSection(props: {
  matches: Array<Record<string, unknown>>;
  matchMap: (match: Record<string, unknown>) => string | undefined;
  finalRound: (
    match: Record<string, unknown>,
  ) => Record<string, unknown> | undefined;
  roundStats: (
    match: Record<string, unknown>,
  ) => Array<Record<string, unknown>>;
  numbers: (value: unknown) => number[];
  textValue: (value: unknown) => string | undefined;
  dateLabel: (value: unknown) => string | undefined;
}) {
  return (
    <section>
      <SectionTitle title="Recent matches" />
      <div class="mt-3 divide-y divide-slate-800 border-y border-slate-800">
        <For each={props.matches}>
          {(match) => (
            <MatchRow
              match={match}
              matchMap={props.matchMap}
              finalRound={props.finalRound}
              roundStats={props.roundStats}
              numbers={props.numbers}
              textValue={props.textValue}
              dateLabel={props.dateLabel}
            />
          )}
        </For>
      </div>
    </section>
  );
}

export function RentalsSection(props: {
  rentals: Array<Record<string, unknown>>;
  inventory?: InventorySnapshot;
  dateLabel: (value: unknown) => string | undefined;
  getRentalTitle: (rental: Record<string, unknown>) => string;
}) {
  const expirationLabel = (rental: Record<string, unknown>) => {
    const expiration = props.dateLabel(rental.expiration_date);
    return expiration ? `Expires ${expiration}` : "Expiry unavailable";
  };
  const issueLabel = (rental: Record<string, unknown>) => {
    const issueDate = props.dateLabel(rental.issue_date);
    return issueDate ? `Started ${issueDate}` : undefined;
  };
  return (
    <section>
      <SectionTitle title="Rentals" />
      <SectionList>
        <For each={props.rentals}>
          {(rental) => (
            <InfoRow
              title={props.getRentalTitle(rental)}
              value={expirationLabel(rental)}
              detail={issueLabel(rental)}
            />
          )}
        </For>
      </SectionList>
    </section>
  );
}
