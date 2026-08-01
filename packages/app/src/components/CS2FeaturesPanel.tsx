import { For, Show, createMemo, createSignal } from "solid-js";
import { fromThrowable } from "neverthrow";
import type {
  CS2FeatureSnapshot,
  InventorySnapshot,
} from "@cs-inv-edit/contracts";

export type CS2ActivityFilter = "all" | "matches" | "items" | "missions";

const readDismissed = fromThrowable(
  (steamId: string): string[] =>
    JSON.parse(
      globalThis.localStorage.getItem(`cs2.activity.dismissed.${steamId}`) ??
        "[]",
    ),
  () => [] as string[],
);
const writeDismissed = fromThrowable(
  (input: { steamId: string; ids: string[] }) =>
    globalThis.localStorage.setItem(
      `cs2.activity.dismissed.${input.steamId}`,
      JSON.stringify(input.ids),
    ),
  () => undefined,
);
const textValue = (value: unknown) =>
  value === undefined || value === null || value === "" ? undefined : String(value);
const dateLabel = (timestamp: unknown) => {
  const value = Number(timestamp);
  return Number.isFinite(value) && value > 0
    ? new Date(value * 1000).toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
      })
    : undefined;
};
const records = (value: unknown) =>
  Array.isArray(value) ? value.filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === "object") : [];
const numbers = (value: unknown) =>
  Array.isArray(value) ? value.map(Number).filter(Number.isFinite) : [];
const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
const roundStats = (match: Record<string, unknown>) => records(match.roundstatsall);
const finalRound = (match: Record<string, unknown>) => roundStats(match).at(-1);
const matchMap = (match: Record<string, unknown>) =>
  textValue(match.map_name ?? match.map ?? match.mapname ?? match.map_display_name ?? finalRound(match)?.map);
const missionName = (mission: Record<string, unknown>, fallback: string) =>
  textValue(mission.name ?? mission.mission_name ?? mission.quest_name) ?? fallback;
const includesQuery = (query: string, ...values: unknown[]) =>
  !query || values.some((value) => String(value ?? "").toLowerCase().includes(query));

export function CS2FeaturesPanel(props: {
  features?: CS2FeatureSnapshot;
  inventory?: InventorySnapshot;
  steamId?: string;
  query: string;
  activityFilter: CS2ActivityFilter;
}) {
  const [dismissed, setDismissed] = createSignal<string[]>(
    props.steamId ? readDismissed(props.steamId).unwrapOr([]) : [],
  );
  const query = createMemo(() => props.query.trim().toLowerCase());
  const itemName = (entry: CS2FeatureSnapshot["activity"][number]) => {
    const definitionId = Number(entry.data.defindex ?? 0);
    return (
      props.inventory?.items.find(
        (item) => item.id === entry.id || item.defindex === definitionId,
      )?.name ??
      textValue(entry.data.customname ?? entry.data.item_name) ??
      "Inventory item"
    );
  };
  const visibleActivity = createMemo(() =>
    (props.features?.activity ?? [])
      .filter((entry) => !dismissed().includes(`${entry.kind}:${entry.id ?? ""}`))
      .filter(() => props.activityFilter === "all" || props.activityFilter === "items")
      .filter((entry) => includesQuery(query(), entry.kind, itemName(entry)))
      .slice()
      .reverse(),
  );
  const matches = createMemo(() =>
    (props.features?.matches ?? [])
      .filter(() => props.activityFilter === "all" || props.activityFilter === "matches")
      .filter((match) => includesQuery(query(), matchMap(match), match.matchid))
      .slice(0, 8),
  );
  const allMissions = createMemo(() => [
    ...(props.features?.quests ?? []).map((data) => ({ kind: "Mission progress", data })),
    ...(props.features?.recurringMissions ?? []).map((data) => ({ kind: "Recurring mission", data })),
  ]);
  const missions = createMemo(() => allMissions().filter(({ kind, data }) =>
    (props.activityFilter === "all" || props.activityFilter === "missions") &&
    includesQuery(query(), kind, missionName(data, kind)),
  ));
  const unreadCount = createMemo(
    () => (props.features?.activity ?? []).filter(
      (entry) => !dismissed().includes(`${entry.kind}:${entry.id ?? ""}`),
    ).length,
  );
  const saveDismissed = (ids: string[]) => {
    setDismissed(ids);
    if (props.steamId)
      writeDismissed({ steamId: props.steamId, ids }).unwrapOr(undefined);
  };
  const dismiss = (key: string) => saveDismissed([...new Set([...dismissed(), key])]);
  const dismissAll = () => saveDismissed([
    ...new Set([
      ...dismissed(),
      ...(props.features?.activity ?? []).map((entry) => `${entry.kind}:${entry.id ?? ""}`),
    ]),
  ]);
  const level = createMemo(() => textValue(
    props.features?.profile?.player_level ?? props.features?.xpShop?.current_level,
  ));
  const xp = createMemo(() => textValue(
    props.features?.profile?.player_cur_xp ?? props.features?.xpShop?.current_xp,
  ));
  const premier = createMemo(() =>
    textValue(props.features?.premier?.season_id),
  );
  const rankings = createMemo(() => records(props.features?.profile?.rankings));
  const commendation = createMemo(() =>
    props.features?.profile?.commendation as Record<string, unknown> | undefined,
  );
  const premierMaps = createMemo(() => records(props.features?.premier?.data_per_map));
  const premierWeeks = createMemo(() => records(props.features?.premier?.data_per_week));
  const premierTotals = createMemo(() => ({
    matches: sum(premierWeeks().map((week) => Number(week.matches_played ?? 0))),
    wins: sum(premierMaps().map((map) => Number(map.wins ?? 0))),
    ties: sum(premierMaps().map((map) => Number(map.ties ?? 0))),
    losses: sum(premierMaps().map((map) => Number(map.losses ?? 0))),
    kills: sum(premierMaps().map((map) => Number(map.kills ?? 0))),
    deaths: sum(premierMaps().map((map) => Number(map.deaths ?? 0))),
    headshots: sum(premierMaps().map((map) => Number(map.headshots ?? 0))),
  }));
  const refreshedAt = createMemo(() => {
    const value = props.features?.refreshedAt;
    if (!value) return undefined;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  });
  const hasTimeline = createMemo(
    () => visibleActivity().length > 0,
  );

  return (
    <main class="mx-auto w-full max-w-7xl flex-1">
      <header class="mb-6 flex flex-wrap items-end justify-between gap-2">
        <div>
          <p class="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-400">Counter-Strike 2</p>
          <h1 class="mt-1 text-2xl font-semibold tracking-tight text-slate-100">Play & progression</h1>
        </div>
        <Show when={refreshedAt()}>{(value) => <p class="text-xs text-slate-500">Updated {value()}</p>}</Show>
      </header>

      <section class="grid overflow-hidden rounded-xl border border-slate-800 bg-slate-950 sm:grid-cols-2 lg:grid-cols-4">
        <Summary label="Level" value={level() ?? "—"} detail={xp() ? `${xp()} current XP` : undefined} />
        <Summary label="Premier season" value={premier() ?? "—"} detail={premierTotals().matches ? `${premierTotals().matches} matches recorded` : undefined} />
        <Summary label="Mission records" value={String(allMissions().length)} />
        <Summary label="New items" value={String(unreadCount())} last />
      </section>

      <div class="mt-7 grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(20rem,0.9fr)]">
        <div class="space-y-8">
          <section>
            <SectionTitle title="Progression" />
            <div class="mt-3 divide-y divide-slate-800 rounded-xl border border-slate-800 bg-slate-950">
              <Show when={level() || xp()}>
                <div class="flex items-center justify-between gap-4 p-4">
                  <div>
                    <p class="font-medium text-slate-100">Profile level {level() ?? "—"}</p>
                    <p class="mt-1 text-sm text-slate-500">Experience earned toward your next profile rank</p>
                  </div>
                  <p class="shrink-0 text-lg font-semibold tabular-nums text-slate-200">{xp() ?? "—"} XP</p>
                </div>
              </Show>
              <For each={missions()}>
                {(mission) => (
                  <div class="flex items-center justify-between gap-4 p-4">
                    <div class="min-w-0">
                      <p class="truncate font-medium text-slate-100">{missionName(mission.data, mission.kind)}</p>
                      <p class="mt-1 text-sm text-slate-500">{mission.kind}</p>
                    </div>
                    <div class="shrink-0 text-right text-sm">
                      <Show when={textValue(mission.data.points_remaining)}>
                        {(value) => <p class="font-medium tabular-nums text-slate-200">{value()} remaining</p>}
                      </Show>
                      <Show when={textValue(mission.data.progress)}>
                        {(value) => <p class="font-medium tabular-nums text-slate-200">{value()} progress</p>}
                      </Show>
                      <Show when={textValue(mission.data.bonus_points)}>
                        {(value) => <p class="mt-1 text-xs text-slate-500">{value()} bonus points recorded</p>}
                      </Show>
                    </div>
                  </div>
                )}
              </For>
              <For each={props.features?.seasonalOperations ?? []}>
                {(season) => (
                  <div class="flex items-center justify-between gap-4 p-4">
                    <div>
                      <p class="font-medium text-slate-100">Seasonal operation</p>
                      <p class="mt-1 text-sm text-slate-500">
                        Tier {textValue(season.tier_unlocked) ?? "—"}
                        {textValue(season.premium_tiers) ? ` · ${textValue(season.premium_tiers)} premium tiers` : ""}
                        {dateLabel(season.season_pass_time) ? ` · pass since ${dateLabel(season.season_pass_time)}` : ""}
                      </p>
                    </div>
                    <Show when={textValue(season.redeemable_balance)}>
                      {(value) => <p class="text-sm font-medium text-slate-200">{value()} available</p>}
                    </Show>
                    <Show when={textValue(season.missions_completed)}>
                      {(value) => <p class="text-xs text-slate-500">{value()} missions completed</p>}
                    </Show>
                  </div>
                )}
              </For>
              <Show when={!level() && !xp() && missions().length === 0 && !(props.features?.seasonalOperations.length)}>
                <EmptyState text="No active progression was returned by the Game Coordinator." />
              </Show>
            </div>
          </section>

          <Show when={rankings().length || commendation() || props.features?.xpShop}>
            <section>
              <SectionTitle title="Profile details" />
              <div class="mt-3 divide-y divide-slate-800 rounded-xl border border-slate-800 bg-slate-950">
                <For each={rankings()}>
                  {(ranking) => (
                    <InfoRow
                      title={textValue(ranking.leaderboard_name) ?? `Competitive ranking ${textValue(ranking.rank_type_id) ?? ""}`.trim()}
                      value={`Rank ${textValue(ranking.rank_id) ?? "—"}`}
                      detail={[
                        textValue(ranking.wins) && `${textValue(ranking.wins)} wins`,
                        textValue(ranking.highest_rank) && `highest rank ${textValue(ranking.highest_rank)}`,
                        dateLabel(ranking.rank_expiry) && `expires ${dateLabel(ranking.rank_expiry)}`,
                      ].filter(Boolean).join(" · ")}
                    />
                  )}
                </For>
                <Show when={commendation()}>
                  {(value) => (
                    <InfoRow
                      title="Commendations"
                      value={`${textValue(value().cmd_friendly) ?? 0} friendly · ${textValue(value().cmd_teaching) ?? 0} teacher · ${textValue(value().cmd_leader) ?? 0} leader`}
                    />
                  )}
                </Show>
                <Show when={props.features?.xpShop}>
                  {(shop) => (
                    <InfoRow
                      title="XP Shop"
                      value={`${textValue(shop().redeemable_balance ?? (shop().postmatch as Record<string, unknown> | undefined)?.redeemable_balance) ?? 0} redeemable`}
                      detail={`${records(shop().xp_tracks).length || numbers(shop().xp_tracks).length} XP tracks`}
                    />
                  )}
                </Show>
                <Show when={records(props.features?.deepStats?.matches).length > 0}>
                  <InfoRow title="Detailed match history" value={`${records(props.features?.deepStats?.matches).length} matches retained`} />
                </Show>
                <Show when={Number(props.features?.profile?.penalty_seconds ?? 0) > 0}>
                  <InfoRow title="Matchmaking penalty" value={`${props.features?.profile?.penalty_seconds} seconds remaining`} />
                </Show>
                <Show when={Number(props.features?.profile?.vac_banned ?? 0) !== 0}>
                  <InfoRow title="VAC status" value="Restricted" />
                </Show>
              </div>
            </section>
          </Show>

          <Show when={premierMaps().length > 0}>
            <section>
              <SectionTitle title={`Premier season ${premier() ?? "summary"}`} />
              <div class="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-slate-800 bg-slate-800 sm:grid-cols-4">
                <Metric label="Record" value={`${premierTotals().wins}–${premierTotals().ties}–${premierTotals().losses}`} />
                <Metric label="Kills" value={String(premierTotals().kills)} />
                <Metric label="Deaths" value={String(premierTotals().deaths)} />
                <Metric label="Headshots" value={String(premierTotals().headshots)} />
              </div>
            </section>
          </Show>

          <Show when={matches().length > 0}>
            <section>
              <SectionTitle title="Recent matches" />
              <div class="mt-3 divide-y divide-slate-800 border-y border-slate-800">
                <For each={matches()}>
                  {(match) => (
                    <div class="grid grid-cols-[1fr_auto] items-center gap-4 py-3">
                      <div>
                        <p class="font-medium text-slate-100">{matchMap(match) ?? "Recorded match"}</p>
                        <p class="mt-1 text-xs text-slate-500">
                          {numbers(finalRound(match)?.team_scores).length
                            ? `Final score ${numbers(finalRound(match)?.team_scores).join("–")}`
                            : `${roundStats(match).length} stat snapshots`}
                          {textValue(finalRound(match)?.match_duration)
                            ? ` · ${Math.round(Number(finalRound(match)?.match_duration) / 60)} min`
                            : ""}
                        </p>
                      </div>
                      <p class="text-sm text-slate-500">{dateLabel(match.matchtime) ?? "Date unavailable"}</p>
                    </div>
                  )}
                </For>
              </div>
            </section>
          </Show>

          <Show when={(props.features?.rentals.length ?? 0) > 0}>
            <section>
              <SectionTitle title="Rentals" />
              <div class="mt-3 divide-y divide-slate-800 rounded-xl border border-slate-800 bg-slate-950">
                <For each={props.features?.rentals ?? []}>
                  {(rental) => (
                    <InfoRow
                      title={props.inventory?.items.find((item) => item.defindex === Number(rental.crate_def_index))?.name ?? "Container rental"}
                      value={dateLabel(rental.expiration_date) ? `Expires ${dateLabel(rental.expiration_date)}` : "Expiry unavailable"}
                      detail={dateLabel(rental.issue_date) ? `Started ${dateLabel(rental.issue_date)}` : undefined}
                    />
                  )}
                </For>
              </div>
            </section>
          </Show>
        </div>

        <section>
          <div class="flex items-center justify-between gap-3">
            <SectionTitle title="New item notifications" />
            <Show when={unreadCount() > 0}>
              <button class="text-xs font-medium text-slate-400 hover:text-slate-200" onClick={dismissAll}>Dismiss all</button>
            </Show>
          </div>
          <div class="mt-3 divide-y divide-slate-800 border-y border-slate-800">
            <For each={visibleActivity()}>
              {(entry) => (
                <div class="group flex gap-3 py-4">
                  <span class="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-slate-700 text-cyan-300">+</span>
                  <div class="min-w-0 flex-1">
                    <p class="font-medium text-slate-100">{itemName(entry)}</p>
                    <p class="mt-1 text-xs capitalize text-slate-500">{entry.kind.replaceAll("_", " ")}{dateLabel(entry.timestamp) ? ` · ${dateLabel(entry.timestamp)}` : ""}</p>
                  </div>
                  <button class="self-start text-xs text-slate-600 opacity-0 transition hover:text-slate-300 group-hover:opacity-100 focus:opacity-100" onClick={() => dismiss(`${entry.kind}:${entry.id ?? ""}`)}>Dismiss</button>
                </div>
              )}
            </For>
            <Show when={!hasTimeline()}>
              <EmptyState text={query() ? "No item notifications match your search." : "You’re caught up. Item drops and acknowledgements received while connected will appear here."} />
            </Show>
          </div>
        </section>
      </div>
    </main>
  );
}

function Summary(props: { label: string; value: string; detail?: string; last?: boolean }) {
  return (
    <div class={`p-4 ${props.last ? "" : "border-b border-slate-800 sm:border-b-0 sm:border-r"}`}>
      <p class="text-xs font-medium text-slate-500">{props.label}</p>
      <p class="mt-1 text-xl font-semibold tabular-nums text-slate-100">{props.value}</p>
      <Show when={props.detail}>{(detail) => <p class="mt-1 text-xs text-slate-500">{detail()}</p>}</Show>
    </div>
  );
}
function SectionTitle(props: { title: string }) {
  return <h2 class="text-sm font-semibold uppercase tracking-[0.12em] text-slate-400">{props.title}</h2>;
}
function EmptyState(props: { text: string }) {
  return <p class="p-5 text-sm leading-6 text-slate-500">{props.text}</p>;
}
function InfoRow(props: { title: string; value: string; detail?: string }) {
  return (
    <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 p-4">
      <div class="min-w-0">
        <p class="font-medium text-slate-100">{props.title}</p>
        <Show when={props.detail}>{(detail) => <p class="mt-1 text-xs text-slate-500">{detail()}</p>}</Show>
      </div>
      <p class="text-sm tabular-nums text-slate-300">{props.value}</p>
    </div>
  );
}
function Metric(props: { label: string; value: string }) {
  return (
    <div class="bg-slate-950 p-4">
      <p class="text-xs text-slate-500">{props.label}</p>
      <p class="mt-1 text-lg font-semibold tabular-nums text-slate-100">{props.value}</p>
    </div>
  );
}
