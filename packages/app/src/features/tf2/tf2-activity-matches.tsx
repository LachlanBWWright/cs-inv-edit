import { For, Show } from "solid-js";
import {
  activityDateTime,
  activityLabel,
  activityNumber,
  activityText,
  firstActivityValue,
  medalLabel,
  playedClasses,
  teamLabel,
} from "./tf2-activity-utils.js";

function outcomeClass(outcome: string | undefined) {
  if (outcome?.toLowerCase() === "win")
    return "bg-emerald-950 text-emerald-300";
  if (outcome?.toLowerCase() === "loss") return "bg-rose-950 text-rose-300";
  return "bg-slate-800 text-slate-300";
}

function OutcomeBadge(props: { outcome: string }) {
  return (
    <span
      class={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${outcomeClass(props.outcome)}`}
    >
      {activityLabel(props.outcome)}
    </span>
  );
}

function MatchMetric(props: { name: string; value: unknown }) {
  return (
    <div>
      <dt class="text-[11px] text-slate-600">{props.name}</dt>
      <dd class="mt-0.5 text-sm font-medium tabular-nums text-slate-200">
        {activityText(props.value) ?? "—"}
      </dd>
    </div>
  );
}

function MatchEntryCard(props: { entry: Record<string, unknown> }) {
  const team = teamLabel(props.entry.team);
  const winner = teamLabel(props.entry.winning_team);
  const suppliedOutcome = firstActivityValue(props.entry, [
    "result",
    "match_result",
    "outcome",
  ]);
  const outcome =
    suppliedOutcome ??
    (team && winner ? (team === winner ? "Win" : "Loss") : undefined);
  const classes = playedClasses(props.entry.classes_played);
  const change = activityNumber(props.entry.display_rating_change);
  const mapName = firstActivityValue(props.entry, [
    "map_display_name",
    "map_name",
    "map",
  ]);
  const context = [
    activityDateTime(
      props.entry.endtime ??
        props.entry.match_time ??
        props.entry.timestamp ??
        props.entry.start_time,
    ),
    firstActivityValue(props.entry, ["match_group_name", "game_mode", "mode"]),
    team ? `Played for ${team}` : undefined,
    activityText(props.entry.season_id)
      ? `Season ${activityText(props.entry.season_id)}`
      : undefined,
  ].filter(Boolean);

  return (
    <article class="py-4">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-2">
            <p class="font-medium text-slate-100">{mapName ?? "TF2 match"}</p>
            <Show when={outcome}>
              {(value) => <OutcomeBadge outcome={value()} />}
            </Show>
          </div>
          <p class="mt-1 text-xs text-slate-500">
            {context.join(" · ") || "Recent match"}
          </p>
        </div>
        <Show when={activityText(props.entry.display_rating)}>
          <div class="text-right">
            <p class="font-semibold tabular-nums text-slate-100">
              {activityText(props.entry.display_rating)} rating
            </p>
            <p
              class={`text-xs ${(change ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400"}`}
            >
              {(change ?? 0) >= 0 ? "+" : ""}
              {change ?? 0} this match
            </p>
          </div>
        </Show>
      </div>
      <dl class="mt-4 grid grid-cols-3 gap-x-4 gap-y-3 sm:grid-cols-6">
        <For
          each={
            [
              ["Score", props.entry.score],
              ["Kills", props.entry.kills],
              ["Deaths", props.entry.deaths],
              ["Damage", props.entry.damage],
              ["Healing", props.entry.healing],
              ["Support", props.entry.support],
            ] as const
          }
        >
          {([name, value]) => <MatchMetric name={name} value={value} />}
        </For>
      </dl>
      <div class="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
        <Show when={classes.length}>
          <span>Classes: {classes.join(", ")}</span>
        </Show>
        <Show when={activityText(props.entry.rank)}>
          <span>Rank {activityText(props.entry.rank)}</span>
        </Show>
        <Show when={medalLabel(props.entry.score_medal)}>
          <span>{medalLabel(props.entry.score_medal)} score medal</span>
        </Show>
        <Show when={medalLabel(props.entry.kills_medal)}>
          <span>{medalLabel(props.entry.kills_medal)} kills medal</span>
        </Show>
      </div>
    </article>
  );
}

export function TF2MatchHistory(props: {
  matches: Record<string, unknown>[];
  fullWidth: boolean;
}) {
  return (
    <section
      class={`${props.fullWidth ? "lg:col-span-12" : "lg:col-span-8"} border-b border-slate-800 py-6`}
    >
      <h2 class="text-sm font-semibold text-slate-100">Match history</h2>
      <div class="mt-3 max-h-[42rem] divide-y divide-slate-800 overflow-y-auto pr-2">
        <For each={props.matches}>
          {(entry) => <MatchEntryCard entry={entry} />}
        </For>
      </div>
    </section>
  );
}
