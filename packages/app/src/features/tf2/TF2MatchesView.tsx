import { Show, createMemo } from "solid-js";
import type {
  GameInventorySnapshot,
  TF2FeatureSnapshot,
} from "@cs-inv-edit/contracts";
import { TF2MatchHistory } from "./tf2-activity-matches.js";
import { activityNumber } from "./tf2-activity-utils.js";

export function TF2MatchesView(props: {
  features?: TF2FeatureSnapshot;
  inventory?: GameInventorySnapshot;
  error?: string;
  onRefreshInventory: () => void;
}) {
  type MatchTotals = {
    games: number;
    score: number;
    kills: number;
    deaths: number;
    damage: number;
  };
  const matches = () => props.features?.matches ?? [];
  const totals = createMemo<MatchTotals>(() =>
    matches().reduce<MatchTotals>(
      (result, match) => ({
        games: result.games + 1,
        score: result.score + (activityNumber(match.score) ?? 0),
        kills: result.kills + (activityNumber(match.kills) ?? 0),
        deaths: result.deaths + (activityNumber(match.deaths) ?? 0),
        damage: result.damage + (activityNumber(match.damage) ?? 0),
      }),
      { games: 0, score: 0, kills: 0, deaths: 0, damage: 0 },
    ),
  );
  const ready = () =>
    props.inventory?.game === "tf2" && props.inventory.status === "ready";

  return (
    <section class="mx-auto w-full max-w-7xl">
      <Show
        when={ready()}
        fallback={
          <button
            class="mt-8 text-sm text-cyan-300"
            onClick={props.onRefreshInventory}
          >
            Load TF2 match history
          </button>
        }
      >
        <div class="grid border-b border-slate-800 sm:grid-cols-5">
          {[
            ["Matches", totals().games],
            [
              "Average score",
              totals().games ? Math.round(totals().score / totals().games) : 0,
            ],
            ["Kills", totals().kills],
            [
              "K/D",
              totals().deaths
                ? (totals().kills / totals().deaths).toFixed(2)
                : "—",
            ],
            ["Damage", totals().damage.toLocaleString()],
          ].map(([name, value]) => (
            <div class="border-b border-slate-800 px-4 py-5 last:border-0 sm:border-b-0 sm:border-r">
              <p class="text-2xl font-semibold tabular-nums text-slate-100">
                {value}
              </p>
              <p class="mt-1 text-xs text-slate-500">{name}</p>
            </div>
          ))}
        </div>
        <Show
          when={matches().length}
          fallback={
            <div class="py-20 text-center text-sm text-slate-500">
              No matches were returned for this playlist.
            </div>
          }
        >
          <TF2MatchHistory matches={matches()} fullWidth />
        </Show>
        <Show when={props.error}>
          <p class="py-3 text-sm text-rose-400">{props.error}</p>
        </Show>
      </Show>
    </section>
  );
}
