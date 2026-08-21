import { For, Show, createMemo, createSignal } from "solid-js";
import {
  readStoredJson,
  stringArraySchema,
  writeStoredJson,
} from "../../shared/lib/storage.js";
import { CS2ProgressionSection } from "./cs2-progression-section.js";
import {
  EmptyState,
  PremierSeasonSection,
  ProfileDetailsSection,
  RecentMatchesSection,
  RentalsSection,
  SectionTitle,
  Summary,
} from "./cs2-features-ui.js";
import type {
  CS2FeatureSnapshot,
  InventorySnapshot,
} from "@cs-inv-edit/contracts";

export type CS2ActivityFilter = "all" | "matches" | "items" | "missions";

const readDismissed = (steamId: string) =>
  readStoredJson(`cs2.activity.dismissed.${steamId}`, stringArraySchema);
const writeDismissed = (input: { steamId: string; ids: string[] }) =>
  writeStoredJson(`cs2.activity.dismissed.${input.steamId}`, input.ids);
const textValue = (value: unknown) =>
  value === undefined || value === null || value === ""
    ? undefined
    : String(value);
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
  Array.isArray(value)
    ? value.filter(
        (entry): entry is Record<string, unknown> =>
          !!entry && typeof entry === "object",
      )
    : [];
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;
const record = (value: unknown): Record<string, unknown> | undefined =>
  isRecord(value) ? value : undefined;
const numbers = (value: unknown) =>
  Array.isArray(value) ? value.map(Number).filter(Number.isFinite) : [];
const sum = (values: number[]) =>
  values.reduce((total, value) => total + value, 0);
const roundStats = (match: Record<string, unknown>) =>
  records(match.roundstatsall);
const finalRound = (match: Record<string, unknown>) => roundStats(match).at(-1);
const matchMap = (match: Record<string, unknown>) =>
  textValue(
    match.map_name ??
      match.map ??
      match.mapname ??
      match.map_display_name ??
      finalRound(match)?.map,
  );
const missionName = (mission: Record<string, unknown>, fallback: string) =>
  textValue(mission.name ?? mission.mission_name ?? mission.quest_name) ??
  fallback;
const includesQuery = (query: string, ...values: unknown[]) =>
  !query ||
  values.some((value) =>
    String(value ?? "")
      .toLowerCase()
      .includes(query),
  );

function ActivityLine(props: {
  entry: CS2FeatureSnapshot["activity"][number];
  itemName: (entry: CS2FeatureSnapshot["activity"][number]) => string;
  dateLabel: (timestamp: unknown) => string | undefined;
  dismiss: (key: string) => void;
}) {
  return (
    <div class="group flex gap-3 py-4">
      <span class="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-slate-700 text-cyan-300">
        +
      </span>
      <div class="min-w-0 flex-1">
        <p class="font-medium text-slate-100">{props.itemName(props.entry)}</p>
        <p class="mt-1 text-xs capitalize text-slate-500">
          {props.entry.kind.replaceAll("_", " ")}
          {props.dateLabel(props.entry.timestamp)
            ? ` · ${props.dateLabel(props.entry.timestamp)}`
            : ""}
        </p>
      </div>
      <button
        class="self-start text-xs text-slate-600 opacity-0 transition hover:text-slate-300 group-hover:opacity-100 focus:opacity-100"
        onClick={() =>
          props.dismiss(`${props.entry.kind}:${props.entry.id ?? ""}`)
        }
      >
        Dismiss
      </button>
    </div>
  );
}

function ActivityTimeline(props: {
  entries: CS2FeatureSnapshot["activity"];
  itemName: (entry: CS2FeatureSnapshot["activity"][number]) => string;
  dateLabel: (timestamp: unknown) => string | undefined;
  dismiss: (key: string) => void;
  hasTimeline: boolean;
  query: string;
}) {
  const emptyText = () =>
    props.query
      ? "No item notifications match your search."
      : "You’re caught up. Item drops and acknowledgements received while connected will appear here.";
  return (
    <section>
      <div class="flex items-center justify-between gap-3">
        <SectionTitle title="New item notifications" />
        <Show when={props.entries.length > 0}>
          <button
            class="text-xs font-medium text-slate-400 hover:text-slate-200"
            onClick={() => props.dismiss("__all__")}
          >
            Dismiss all
          </button>
        </Show>
      </div>
      <div class="mt-3 divide-y divide-slate-800 border-y border-slate-800">
        <For each={props.entries}>
          {(entry) => (
            <ActivityLine
              entry={entry}
              itemName={props.itemName}
              dateLabel={props.dateLabel}
              dismiss={props.dismiss}
            />
          )}
        </For>
        <Show when={!props.hasTimeline}>
          <EmptyState text={emptyText()} />
        </Show>
      </div>
    </section>
  );
}

export function CS2FeaturesPanel(props: {
  features?: CS2FeatureSnapshot;
  inventory?: InventorySnapshot;
  steamId?: string;
  query: string;
  activityFilter: CS2ActivityFilter;
}) {
  const rentalTitle = (rental: Record<string, unknown>) =>
    props.inventory?.items.find(
      (item) => item.defindex === Number(rental.crate_def_index),
    )?.name ?? "Container rental";
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
      .filter(
        (entry) => !dismissed().includes(`${entry.kind}:${entry.id ?? ""}`),
      )
      .filter(
        () =>
          props.activityFilter === "all" || props.activityFilter === "items",
      )
      .filter((entry) => includesQuery(query(), entry.kind, itemName(entry)))
      .slice()
      .reverse(),
  );
  const matches = createMemo(() =>
    (props.features?.matches ?? [])
      .filter(
        () =>
          props.activityFilter === "all" || props.activityFilter === "matches",
      )
      .filter((match) => includesQuery(query(), matchMap(match), match.matchid))
      .slice(0, 8),
  );
  const allMissions = createMemo(() => [
    ...(props.features?.quests ?? []).map((data) => ({
      kind: "Mission progress",
      data,
    })),
    ...(props.features?.recurringMissions ?? []).map((data) => ({
      kind: "Recurring mission",
      data,
    })),
  ]);
  const missions = createMemo(() =>
    allMissions().filter(
      ({ kind, data }) =>
        (props.activityFilter === "all" ||
          props.activityFilter === "missions") &&
        includesQuery(query(), kind, missionName(data, kind)),
    ),
  );
  const unreadCount = createMemo(
    () =>
      (props.features?.activity ?? []).filter(
        (entry) => !dismissed().includes(`${entry.kind}:${entry.id ?? ""}`),
      ).length,
  );
  const saveDismissed = (ids: string[]) => {
    setDismissed(ids);
    if (props.steamId)
      writeDismissed({ steamId: props.steamId, ids }).unwrapOr(undefined);
  };
  const dismiss = (key: string) =>
    saveDismissed([...new Set([...dismissed(), key])]);
  const dismissAll = () =>
    saveDismissed([
      ...new Set([
        ...dismissed(),
        ...(props.features?.activity ?? []).map(
          (entry) => `${entry.kind}:${entry.id ?? ""}`,
        ),
      ]),
    ]);
  const level = createMemo(() =>
    textValue(
      props.features?.profile?.player_level ??
        props.features?.xpShop?.current_level,
    ),
  );
  const xp = createMemo(() =>
    textValue(
      props.features?.profile?.player_cur_xp ??
        props.features?.xpShop?.current_xp,
    ),
  );
  const premier = createMemo(() =>
    textValue(props.features?.premier?.season_id),
  );
  const rankings = createMemo(() => records(props.features?.profile?.rankings));
  const commendation = createMemo(() =>
    record(props.features?.profile?.commendation),
  );
  const premierMaps = createMemo(() =>
    records(props.features?.premier?.data_per_map),
  );
  const premierWeeks = createMemo(() =>
    records(props.features?.premier?.data_per_week),
  );
  const premierTotals = createMemo(() => ({
    matches: sum(
      premierWeeks().map((week) => Number(week.matches_played ?? 0)),
    ),
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
    return Number.isNaN(date.getTime())
      ? undefined
      : date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  });
  const hasTimeline = createMemo(() => visibleActivity().length > 0);

  return (
    <main class="mx-auto w-full max-w-7xl flex-1">
      <header class="mb-6 flex flex-wrap items-end justify-between gap-2">
        <div>
          <p class="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-400">
            Counter-Strike 2
          </p>
          <h1 class="mt-1 text-2xl font-semibold tracking-tight text-slate-100">
            Play & progression
          </h1>
        </div>
        <Show when={refreshedAt()}>
          {(value) => <p class="text-xs text-slate-500">Updated {value()}</p>}
        </Show>
      </header>

      <section class="grid overflow-hidden rounded-xl border border-slate-800 bg-slate-950 sm:grid-cols-2 lg:grid-cols-4">
        <Summary
          label="Level"
          value={level() ?? "—"}
          detail={xp() ? `${xp()} current XP` : undefined}
        />
        <Summary
          label="Premier season"
          value={premier() ?? "—"}
          detail={
            premierTotals().matches
              ? `${premierTotals().matches} matches recorded`
              : undefined
          }
        />
        <Summary label="Mission records" value={String(allMissions().length)} />
        <Summary label="New items" value={String(unreadCount())} last />
      </section>

      <div class="mt-7 grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(20rem,0.9fr)]">
        <div class="space-y-8">
          <CS2ProgressionSection
            level={level()}
            xp={xp()}
            missions={missions()}
            seasonal={props.features?.seasonalOperations ?? []}
            textValue={textValue}
            missionName={missionName}
            dateLabel={dateLabel}
          />

          <Show
            when={rankings().length || commendation() || props.features?.xpShop}
          >
            <ProfileDetailsSection
              rankings={rankings()}
              commendation={commendation()}
              xpShop={props.features?.xpShop}
              deepStatsMatches={props.features?.deepStats?.matches}
              penaltySeconds={props.features?.profile?.penalty_seconds}
              vacBanned={props.features?.profile?.vac_banned}
              textValue={textValue}
              dateLabel={dateLabel}
              records={records}
              record={record}
              numbers={numbers}
            />
          </Show>

          <Show when={premierMaps().length > 0}>
            <PremierSeasonSection
              premier={premier()}
              premierTotals={premierTotals()}
            />
          </Show>

          <Show when={matches().length > 0}>
            <RecentMatchesSection
              matches={matches()}
              matchMap={matchMap}
              finalRound={finalRound}
              roundStats={roundStats}
              numbers={numbers}
              textValue={textValue}
              dateLabel={dateLabel}
            />
          </Show>

          <Show when={(props.features?.rentals.length ?? 0) > 0}>
            <RentalsSection
              rentals={props.features?.rentals ?? []}
              inventory={props.inventory}
              dateLabel={dateLabel}
              getRentalTitle={rentalTitle}
            />
          </Show>
        </div>

        <ActivityTimeline
          entries={visibleActivity()}
          itemName={itemName}
          dateLabel={dateLabel}
          dismiss={(key) => (key === "__all__" ? dismissAll() : dismiss(key))}
          hasTimeline={hasTimeline()}
          query={query()}
        />
      </div>
    </main>
  );
}
