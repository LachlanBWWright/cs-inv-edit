import { For, Show } from "solid-js";
import type { TF2FeatureSnapshot } from "@cs-inv-edit/contracts";
import { activityNumber, activityText } from "./tf2-activity-utils.js";

type Quest = TF2FeatureSnapshot["quests"][number];

function QuestProgress(props: { label: string; value: number | undefined }) {
  return (
    <div>
      <div class="h-1.5 overflow-hidden rounded-full bg-slate-800">
        <div
          class="h-full bg-red-400"
          style={{ width: `${Math.min(100, props.value ?? 0)}%` }}
        />
      </div>
      <p class="mt-1.5 text-[11px] text-slate-500">
        {props.label} · {props.value ?? 0}
      </p>
    </div>
  );
}

function QuestProgressBars(props: { points: Array<number | undefined> }) {
  return (
    <div class="mt-4 grid grid-cols-3 gap-3">
      <For
        each={
          [
            ["Primary", props.points[0]],
            ["Bonus 1", props.points[1]],
            ["Bonus 2", props.points[2]],
          ] as const
        }
      >
        {([label, value]) => <QuestProgress label={label} value={value} />}
      </For>
    </div>
  );
}

function QuestObjectivesList(props: { objectives: string[] }) {
  if (!props.objectives.length) return null;
  return (
    <ul class="mt-3 grid gap-1.5 text-xs text-slate-400 sm:grid-cols-2">
      <For each={props.objectives}>
        {(objective) => (
          <li class="flex gap-2">
            <span class="text-red-400">•</span>
            <span>{objective}</span>
          </li>
        )}
      </For>
    </ul>
  );
}

function QuestItem(props: {
  quest: Quest;
  nameFor: (entry: Record<string, unknown>, fallback: string) => string;
  objectives: string[];
  points: Array<number | undefined>;
}) {
  const fallbackName = () =>
    props.quest.active === false ? "Completed contract" : "Active contract";
  return (
    <article class="py-5">
      <div class="flex items-center justify-between gap-4">
        <div>
          <p class="font-medium text-slate-100">
            {props.nameFor(props.quest, fallbackName())}
          </p>
          <p class="mt-1 text-xs text-slate-500">
            {props.quest.active === false ? "Complete" : "In progress"}
          </p>
        </div>
        <span class="text-sm font-semibold text-slate-200">
          {props.points.reduce<number>((sum, value) => sum + (value ?? 0), 0)}{" "}
          points
        </span>
      </div>
      <Show when={activityText(props.quest.description)}>
        <p class="mt-3 text-sm text-slate-400">
          {activityText(props.quest.description)}
        </p>
      </Show>
      <QuestObjectivesList objectives={props.objectives} />
      <QuestProgressBars points={props.points} />
    </article>
  );
}

export function TF2CampaignQuestList(props: {
  quests: Quest[];
  nameFor: (entry: Record<string, unknown>, fallback: string) => string;
  objectivesFor: (entry: Record<string, unknown>) => string[];
}) {
  return (
    <div class="mt-3 divide-y divide-slate-800 border-y border-slate-800">
      <For each={props.quests}>
        {(quest) => {
          const points = [
            activityNumber(quest.points_0),
            activityNumber(quest.points_1),
            activityNumber(quest.points_2),
          ];
          return (
            <QuestItem
              quest={quest}
              nameFor={props.nameFor}
              objectives={props.objectivesFor(quest)}
              points={points}
            />
          );
        }}
      </For>
    </div>
  );
}
