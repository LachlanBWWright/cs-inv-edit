import { For, Show } from "solid-js";
import { EmptyState, SectionTitle } from "./cs2-features-ui.js";

function ProgressionMissionRow(props: {
  mission: { kind: string; data: Record<string, unknown> };
  textValue: (value: unknown) => string | undefined;
  missionName: (data: Record<string, unknown>, fallback: string) => string;
}) {
  const value = (key: string) => props.textValue(props.mission.data[key]);
  const criteria = () =>
    [
      value("gamemode")?.replaceAll("_", " "),
      value("map") ?? value("mapgroup")?.replace(/^mg_/, ""),
    ].filter((entry): entry is string => !!entry);
  const objective = () =>
    value("description") && !value("description")?.includes("{")
      ? value("description")?.replaceAll(/<\/?b>/g, "")
      : value("expression")
          ?.replaceAll("%", "")
          .replaceAll("_", " ")
          .replaceAll("&&", " and ")
          .replaceAll("||", " or ");
  const progressTotal = () => {
    const required = props.textValue(props.mission.data.points_required);
    return required ? ` / ${required}` : "";
  };
  return (
    <div class="grid gap-4 p-4 sm:grid-cols-[minmax(0,1fr)_auto]">
      <div class="min-w-0 space-y-2">
        <p class="font-medium text-slate-100">
          {props.missionName(props.mission.data, props.mission.kind)}
        </p>
        <Show when={objective()}>
          {(description) => (
            <p class="text-sm text-slate-300">{description()}</p>
          )}
        </Show>
        <div class="flex flex-wrap gap-x-3 gap-y-1 text-xs capitalize text-slate-500">
          <span>{props.mission.kind}</span>
          <For each={criteria()}>{(entry) => <span>{entry}</span>}</For>
          <Show when={value("points_required")}>
            {(points) => <span>{points()} points required</span>}
          </Show>
        </div>
      </div>
      <div class="shrink-0 text-right text-sm">
        <Show when={value("xp_reward")}>
          {(xp) => (
            <p class="font-semibold tabular-nums text-cyan-300">{xp()} XP</p>
          )}
        </Show>
        <Show when={value("points_remaining")}>
          {(value) => (
            <p class="font-medium tabular-nums text-slate-200">
              {value()} remaining
            </p>
          )}
        </Show>
        <Show when={value("progress")}>
          {(value) => (
            <p class="font-medium tabular-nums text-slate-200">
              {value()}
              {progressTotal()} progress
            </p>
          )}
        </Show>
        <Show when={value("bonus_points")}>
          {(value) => (
            <p class="mt-1 text-xs text-slate-500">
              {value()} bonus points recorded
            </p>
          )}
        </Show>
      </div>
    </div>
  );
}

function ProfileProgress(props: {
  level: string | undefined;
  xp: string | undefined;
}) {
  return (
    <div class="flex items-center justify-between gap-4 p-4">
      <div>
        <p class="font-medium text-slate-100">
          Profile level {props.level ?? "—"}
        </p>
        <p class="mt-1 text-sm text-slate-500">
          Experience earned toward your next profile rank
        </p>
      </div>
      <p class="shrink-0 text-lg font-semibold tabular-nums text-slate-200">
        {props.xp ?? "—"} XP
      </p>
    </div>
  );
}

function ProgressionSeasonRow(props: {
  season: Record<string, unknown>;
  textValue: (value: unknown) => string | undefined;
  dateLabel: (value: unknown) => string | undefined;
}) {
  return (
    <div class="flex items-center justify-between gap-4 p-4">
      <div>
        <p class="font-medium text-slate-100">Seasonal operation</p>
        <p class="mt-1 text-sm text-slate-500">
          Tier {props.textValue(props.season.tier_unlocked) ?? "—"}
          {props.textValue(props.season.premium_tiers)
            ? ` · ${props.textValue(props.season.premium_tiers)} premium tiers`
            : ""}
          {props.dateLabel(props.season.season_pass_time)
            ? ` · pass since ${props.dateLabel(props.season.season_pass_time)}`
            : ""}
        </p>
      </div>
      <Show when={props.textValue(props.season.redeemable_balance)}>
        {(value) => (
          <p class="text-sm font-medium text-slate-200">{value()} available</p>
        )}
      </Show>
      <Show when={props.textValue(props.season.missions_completed)}>
        {(value) => (
          <p class="text-xs text-slate-500">{value()} missions completed</p>
        )}
      </Show>
    </div>
  );
}

export function CS2ProgressionSection(props: {
  level: string | undefined;
  xp: string | undefined;
  missions: { kind: string; data: Record<string, unknown> }[];
  seasonal: Record<string, unknown>[];
  textValue: (value: unknown) => string | undefined;
  missionName: (data: Record<string, unknown>, fallback: string) => string;
  dateLabel: (value: unknown) => string | undefined;
}) {
  return (
    <section>
      <SectionTitle title="Progression" />
      <div class="mt-3 divide-y divide-slate-800 rounded-xl border border-slate-800 bg-slate-950">
        <Show when={props.level || props.xp}>
          <ProfileProgress level={props.level} xp={props.xp} />
        </Show>
        <For each={props.missions}>
          {(mission) => (
            <ProgressionMissionRow
              mission={mission}
              textValue={props.textValue}
              missionName={props.missionName}
            />
          )}
        </For>
        <For each={props.seasonal}>
          {(season) => (
            <ProgressionSeasonRow
              season={season}
              textValue={props.textValue}
              dateLabel={props.dateLabel}
            />
          )}
        </For>
        <Show
          when={
            !props.level &&
            !props.xp &&
            props.missions.length === 0 &&
            props.seasonal.length === 0
          }
        >
          <EmptyState text="No active progression was returned by the Game Coordinator." />
        </Show>
      </div>
    </section>
  );
}
