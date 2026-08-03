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
          {(entry) => {
            const team = teamLabel(entry.team);
            const winner = teamLabel(entry.winning_team);
            const suppliedOutcome = firstActivityValue(entry, [
              "result",
              "match_result",
              "outcome",
            ]);
            const outcome =
              suppliedOutcome ??
              (team && winner ? (team === winner ? "Win" : "Loss") : undefined);
            const classes = playedClasses(entry.classes_played);
            const change = activityNumber(entry.display_rating_change);
            const context = [
              activityDateTime(
                entry.endtime ??
                  entry.match_time ??
                  entry.timestamp ??
                  entry.start_time,
              ),
              firstActivityValue(entry, [
                "match_group_name",
                "game_mode",
                "mode",
              ]),
              team ? `Played for ${team}` : undefined,
              activityText(entry.season_id)
                ? `Season ${activityText(entry.season_id)}`
                : undefined,
            ].filter(Boolean);
            return (
              <article class="py-4">
                <div class="flex flex-wrap items-start justify-between gap-3">
                  <div class="min-w-0">
                    <div class="flex flex-wrap items-center gap-2">
                      <p class="font-medium text-slate-100">
                        {firstActivityValue(entry, [
                          "map_display_name",
                          "map_name",
                          "map",
                        ]) ?? "TF2 match"}
                      </p>
                      <Show when={outcome}>
                        <span
                          class={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${outcome?.toLowerCase() === "win" ? "bg-emerald-950 text-emerald-300" : outcome?.toLowerCase() === "loss" ? "bg-rose-950 text-rose-300" : "bg-slate-800 text-slate-300"}`}
                        >
                          {activityLabel(outcome!)}
                        </span>
                      </Show>
                    </div>
                    <p class="mt-1 text-xs text-slate-500">
                      {context.join(" · ") || "Recent match"}
                    </p>
                  </div>
                  <Show when={activityText(entry.display_rating)}>
                    <div class="text-right">
                      <p class="font-semibold tabular-nums text-slate-100">
                        {activityText(entry.display_rating)} rating
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
                        ["Score", entry.score],
                        ["Kills", entry.kills],
                        ["Deaths", entry.deaths],
                        ["Damage", entry.damage],
                        ["Healing", entry.healing],
                        ["Support", entry.support],
                      ] as const
                    }
                  >
                    {([name, value]) => (
                      <div>
                        <dt class="text-[11px] text-slate-600">{name}</dt>
                        <dd class="mt-0.5 text-sm font-medium tabular-nums text-slate-200">
                          {activityText(value) ?? "—"}
                        </dd>
                      </div>
                    )}
                  </For>
                </dl>
                <div class="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                  <Show when={classes.length}>
                    <span>Classes: {classes.join(", ")}</span>
                  </Show>
                  <Show when={activityText(entry.rank)}>
                    <span>Rank {activityText(entry.rank)}</span>
                  </Show>
                  <Show when={medalLabel(entry.score_medal)}>
                    <span>{medalLabel(entry.score_medal)} score medal</span>
                  </Show>
                  <Show when={medalLabel(entry.kills_medal)}>
                    <span>{medalLabel(entry.kills_medal)} kills medal</span>
                  </Show>
                </div>
              </article>
            );
          }}
        </For>
      </div>
    </section>
  );
}
