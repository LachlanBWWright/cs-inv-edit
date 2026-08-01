import { For, Show, createMemo } from "solid-js";
import type {
  GameInventorySnapshot,
  TF2FeatureSnapshot,
} from "@cs-inv-edit/contracts";
import type { TF2ActivityFilter } from "./tf2-activity-utils.js";
import { activityNumber, activityText } from "./tf2-activity-utils.js";

export function TF2CampaignsView(props: {
  features?: TF2FeatureSnapshot;
  inventory?: GameInventorySnapshot;
  filter: TF2ActivityFilter;
  onRefreshInventory: () => void;
}) {
  const quests = () => props.features?.quests ?? [];
  const nodes = () => props.features?.questNodes ?? [];
  const rewards = () => props.features?.questRewards ?? [];
  const itemNames = createMemo(
    () =>
      new Map(
        (props.inventory?.items ?? []).map((item) => [
          item.definitionId,
          item.name,
        ]),
      ),
  );
  const nameFor = (entry: Record<string, unknown>, fallback: string) =>
    itemNames().get(activityNumber(entry.defindex) ?? 0) ??
    activityText(entry.name) ??
    fallback;
  const objectivesFor = (entry: Record<string, unknown>) =>
    Array.isArray(entry.objectives)
      ? entry.objectives.filter(
          (value): value is string => typeof value === "string",
        )
      : [];
  const stars = createMemo(() =>
    nodes().reduce(
      (sum, node) =>
        sum +
        [node.star_0_earned, node.star_1_earned, node.star_2_earned].filter(
          Boolean,
        ).length,
      0,
    ),
  );
  const showContracts = () =>
    props.filter === "all" || props.filter === "contracts";
  const showRewards = () =>
    props.filter === "all" || props.filter === "updates";
  return (
    <section class="mx-auto w-full max-w-7xl">
      <div class="grid grid-cols-3 border-b border-slate-800">
        <div class="px-4 py-5">
          <p class="text-2xl font-semibold text-slate-100">
            {quests().filter((q) => q.active !== false).length}
          </p>
          <p class="text-xs text-slate-500">Active contracts</p>
        </div>
        <div class="border-x border-slate-800 px-4 py-5">
          <p class="text-2xl font-semibold text-amber-300">{stars()}</p>
          <p class="text-xs text-slate-500">Stars earned</p>
        </div>
        <div class="px-4 py-5">
          <p class="text-2xl font-semibold text-slate-100">
            {rewards().reduce(
              (sum, reward) => sum + (activityNumber(reward.count) ?? 1),
              0,
            )}
          </p>
          <p class="text-xs text-slate-500">Rewards redeemed</p>
        </div>
      </div>
      <div class="grid gap-8 py-7 lg:grid-cols-[minmax(0,1.4fr)_minmax(20rem,0.6fr)]">
        <Show when={showContracts()}>
          <div>
            <h2 class="text-sm font-semibold text-slate-100">Contracts</h2>
            <div class="mt-3 divide-y divide-slate-800 border-y border-slate-800">
              <For each={quests()}>
                {(quest) => {
                  const points = [
                    activityNumber(quest.points_0),
                    activityNumber(quest.points_1),
                    activityNumber(quest.points_2),
                  ];
                  return (
                    <article class="py-5">
                      <div class="flex items-center justify-between gap-4">
                        <div>
                          <p class="font-medium text-slate-100">
                            {nameFor(
                              quest,
                              quest.active === false
                                ? "Completed contract"
                                : "Active contract",
                            )}
                          </p>
                          <p class="mt-1 text-xs text-slate-500">
                            {quest.active === false
                              ? "Complete"
                              : "In progress"}
                          </p>
                        </div>
                        <span class="text-sm font-semibold text-slate-200">
                          {points.reduce<number>(
                            (sum, value) => sum + (value ?? 0),
                            0,
                          )}{" "}
                          points
                        </span>
                      </div>
                      <Show when={activityText(quest.description)}>
                        <p class="mt-3 text-sm text-slate-400">
                          {activityText(quest.description)}
                        </p>
                      </Show>
                      <Show when={objectivesFor(quest).length}>
                        <ul class="mt-3 grid gap-1.5 text-xs text-slate-400 sm:grid-cols-2">
                          <For each={objectivesFor(quest)}>
                            {(objective) => (
                              <li class="flex gap-2">
                                <span class="text-red-400">•</span>
                                <span>{objective}</span>
                              </li>
                            )}
                          </For>
                        </ul>
                      </Show>
                      <div class="mt-4 grid grid-cols-3 gap-3">
                        <For
                          each={
                            [
                              ["Primary", points[0]],
                              ["Bonus 1", points[1]],
                              ["Bonus 2", points[2]],
                            ] as const
                          }
                        >
                          {([label, value]) => (
                            <div>
                              <div class="h-1.5 overflow-hidden rounded-full bg-slate-800">
                                <div
                                  class="h-full bg-red-400"
                                  style={{
                                    width: `${Math.min(100, value ?? 0)}%`,
                                  }}
                                />
                              </div>
                              <p class="mt-1.5 text-[11px] text-slate-500">
                                {label} · {value ?? 0}
                              </p>
                            </div>
                          )}
                        </For>
                      </div>
                    </article>
                  );
                }}
              </For>
            </div>
          </div>
        </Show>
        <div class="space-y-8">
          <Show when={showContracts()}>
            <section>
              <h2 class="text-sm font-semibold text-slate-100">Campaign map</h2>
              <div class="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-slate-800 bg-slate-800">
                <For each={nodes()}>
                  {(node) => {
                    const earned = [
                      node.star_0_earned,
                      node.star_1_earned,
                      node.star_2_earned,
                    ].filter(Boolean).length;
                    return (
                      <div class="bg-slate-950 p-4">
                        <p class="text-sm font-medium text-slate-200">
                          {nameFor(node, "Campaign node")}
                        </p>
                        <p class="mt-2 tracking-wider text-amber-300">
                          {"★".repeat(earned)}
                          <span class="text-slate-700">
                            {"★".repeat(3 - earned)}
                          </span>
                        </p>
                        <p class="mt-2 text-[11px] text-slate-500">
                          {node.loot_claimed === true
                            ? "Node reward claimed"
                            : "Reward not claimed"}
                        </p>
                      </div>
                    );
                  }}
                </For>
              </div>
            </section>
          </Show>
          <Show when={showRewards()}>
            <section>
              <h2 class="text-sm font-semibold text-slate-100">
                Reward history
              </h2>
              <div class="mt-3 divide-y divide-slate-800 border-y border-slate-800">
                <For each={rewards()}>
                  {(reward) => (
                    <div class="flex items-center justify-between gap-3 py-3">
                      <p class="text-sm text-slate-200">
                        {nameFor(reward, "Contract reward")}
                      </p>
                      <Show when={activityText(reward.description)}>
                        <p class="mt-0.5 text-xs text-slate-500">
                          {activityText(reward.description)}
                        </p>
                      </Show>
                      <span class="text-xs text-slate-500">
                        Redeemed ×{activityText(reward.count) ?? "1"}
                      </span>
                    </div>
                  )}
                </For>
              </div>
            </section>
          </Show>
        </div>
      </div>
    </section>
  );
}
