import { For, Show, createMemo } from "solid-js";
import type {
  GameInventorySnapshot,
  TF2FeatureSnapshot,
} from "@cs-inv-edit/contracts";
import type { TF2ActivityFilter } from "./tf2-activity-utils.js";
import { activityNumber, activityText } from "./tf2-activity-utils.js";
import { TF2CampaignQuestList } from "./tf2-campaign-quest-list.js";

function CampaignSummary(props: {
  activeContractCount: number;
  stars: number;
  rewardCount: number;
}) {
  return (
    <div class="grid grid-cols-3 border-b border-slate-800">
      <div class="px-4 py-5">
        <p class="text-2xl font-semibold text-slate-100">
          {props.activeContractCount}
        </p>
        <p class="text-xs text-slate-500">Active contracts</p>
      </div>
      <div class="border-x border-slate-800 px-4 py-5">
        <p class="text-2xl font-semibold text-amber-300">{props.stars}</p>
        <p class="text-xs text-slate-500">Stars earned</p>
      </div>
      <div class="px-4 py-5">
        <p class="text-2xl font-semibold text-slate-100">{props.rewardCount}</p>
        <p class="text-xs text-slate-500">Rewards redeemed</p>
      </div>
    </div>
  );
}

function CampaignNode(props: {
  node: TF2FeatureSnapshot["questNodes"][number];
  nameFor: (entry: Record<string, unknown>, fallback: string) => string;
}) {
  const earned = [
    props.node.star_0_earned,
    props.node.star_1_earned,
    props.node.star_2_earned,
  ].filter(Boolean).length;
  const rewardStatus = () =>
    props.node.loot_claimed === true
      ? "Node reward claimed"
      : "Reward not claimed";
  return (
    <div class="bg-slate-950 p-4">
      <p class="text-sm font-medium text-slate-200">
        {props.nameFor(props.node, "Campaign node")}
      </p>
      <p class="mt-2 tracking-wider text-amber-300">
        {"★".repeat(earned)}
        <span class="text-slate-700">{"★".repeat(3 - earned)}</span>
      </p>
      <p class="mt-2 text-[11px] text-slate-500">{rewardStatus()}</p>
    </div>
  );
}

function CampaignMap(props: {
  nodes: TF2FeatureSnapshot["questNodes"];
  nameFor: (entry: Record<string, unknown>, fallback: string) => string;
}) {
  return (
    <section>
      <h2 class="text-sm font-semibold text-slate-100">Campaign map</h2>
      <div class="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-slate-800 bg-slate-800">
        <For each={props.nodes}>
          {(node) => <CampaignNode node={node} nameFor={props.nameFor} />}
        </For>
      </div>
    </section>
  );
}

function RewardRow(props: {
  reward: TF2FeatureSnapshot["questRewards"][number];
  nameFor: (entry: Record<string, unknown>, fallback: string) => string;
}) {
  return (
    <div class="flex items-center justify-between gap-3 py-3">
      <p class="text-sm text-slate-200">
        {props.nameFor(props.reward, "Contract reward")}
      </p>
      <Show when={activityText(props.reward.description)} keyed>
        {(description) => (
          <p class="mt-0.5 text-xs text-slate-500">{description}</p>
        )}
      </Show>
      <span class="text-xs text-slate-500">
        Redeemed ×{activityText(props.reward.count) ?? "1"}
      </span>
    </div>
  );
}

function RewardHistory(props: {
  rewards: TF2FeatureSnapshot["questRewards"];
  nameFor: (entry: Record<string, unknown>, fallback: string) => string;
}) {
  return (
    <section>
      <h2 class="text-sm font-semibold text-slate-100">Reward history</h2>
      <div class="mt-3 divide-y divide-slate-800 border-y border-slate-800">
        <For each={props.rewards}>
          {(reward) => <RewardRow reward={reward} nameFor={props.nameFor} />}
        </For>
      </div>
    </section>
  );
}

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
      <CampaignSummary
        activeContractCount={quests().filter((q) => q.active !== false).length}
        stars={stars()}
        rewardCount={rewards().reduce(
          (sum, reward) => sum + (activityNumber(reward.count) ?? 1),
          0,
        )}
      />
      <div class="grid gap-8 py-7 lg:grid-cols-[minmax(0,1.4fr)_minmax(20rem,0.6fr)]">
        <Show when={showContracts()}>
          <div>
            <h2 class="text-sm font-semibold text-slate-100">Contracts</h2>
            <TF2CampaignQuestList
              quests={quests()}
              nameFor={nameFor}
              objectivesFor={objectivesFor}
            />
          </div>
        </Show>
        <div class="space-y-8">
          <Show when={showContracts()}>
            <CampaignMap nodes={nodes()} nameFor={nameFor} />
          </Show>
          <Show when={showRewards()}>
            <RewardHistory rewards={rewards()} nameFor={nameFor} />
          </Show>
        </div>
      </div>
    </section>
  );
}
