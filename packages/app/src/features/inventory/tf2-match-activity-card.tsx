import { For } from "solid-js";

export function TF2MatchActivityCard(props: {
  entry: Record<string, unknown>;
}) {
  const entry = props.entry;
  const value = (key: string) => entry[key];
  const displayValue = (key: string) => {
    const current = value(key);
    return current === undefined ? "Unavailable" : String(current);
  };
  return (
    <div class="rounded-lg border border-slate-800 bg-slate-950 p-3">
      <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">
        Match result
      </p>
      <p class="mt-1 text-sm text-slate-200">
        Match {String(value("match_id") ?? value("matchId") ?? "recorded")}
      </p>
      <p class="mt-1 text-xs text-slate-500">
        Map {String(value("map_index") ?? "unavailable")} · group{" "}
        {String(value("match_group") ?? "unavailable")} · season{" "}
        {String(value("season_id") ?? "unavailable")}
      </p>
      <dl class="mt-3 grid grid-cols-3 gap-2 text-xs">
        <For
          each={
            [
              ["Score", "score"],
              ["Kills", "kills"],
              ["Deaths", "deaths"],
              ["Damage", "damage"],
              ["Healing", "healing"],
              ["Support", "support"],
              ["Rating", "display_rating"],
              ["Change", "display_rating_change"],
              ["Party", "original_party_id"],
            ] as const
          }
        >
          {([label, key]) => (
            <div>
              <dt class="text-slate-600">{label}</dt>
              <dd class="text-slate-300">{displayValue(key)}</dd>
            </div>
          )}
        </For>
      </dl>
    </div>
  );
}
