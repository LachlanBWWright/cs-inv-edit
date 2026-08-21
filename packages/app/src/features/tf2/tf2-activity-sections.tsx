import { For, Show } from "solid-js";
import type {
  GameInventorySnapshot,
  TF2FeatureSnapshot,
} from "@cs-inv-edit/contracts";
import { TF2MatchActivityCard } from "../inventory/tf2-match-activity-card.js";

interface TF2ActivityEntry {
  kind: string;
  id?: string | number;
  data: Record<string, unknown>;
  timestamp?: number;
}

interface TF2ActivityCardsProps {
  tf2Features: TF2FeatureSnapshot | undefined;
  tf2Activity: TF2ActivityEntry[];
  snapshot: GameInventorySnapshot | undefined;
  dismissActivity: (key: string) => void;
}

function activityDescription(entry: TF2ActivityEntry, ownedItemName?: string) {
  if (entry.kind === "item_pickup") {
    return (
      ownedItemName ??
      `Item definition ${String(entry.data.def_index ?? "unknown")}`
    );
  }
  return String(
    entry.data.notification_string ??
      (entry.id ? `Record ${entry.id}` : "New TF2 activity"),
  );
}

function TF2QuestCard(props: { entry: TF2FeatureSnapshot["quests"][number] }) {
  return (
    <div class="rounded-lg border border-slate-800 bg-slate-950 p-3">
      <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">
        Contract
      </p>
      <p class="mt-1 text-sm text-slate-200">
        Quest{" "}
        {String(
          props.entry.quest_id ??
            props.entry.questId ??
            props.entry.id ??
            "active",
        )}
      </p>
      <p class="mt-1 text-xs text-slate-500">
        {props.entry.active === false ? "Completed or inactive" : "Active"}
        {" · "}objectives {String(props.entry.points_0 ?? "—")} /{" "}
        {String(props.entry.points_1 ?? "—")} /{" "}
        {String(props.entry.points_2 ?? "—")}
      </p>
    </div>
  );
}

function TF2QuestNodeCard(props: {
  entry: TF2FeatureSnapshot["questNodes"][number];
}) {
  return (
    <div class="rounded-lg border border-slate-800 bg-slate-950 p-3">
      <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">
        Quest-map node
      </p>
      <p class="mt-1 text-sm text-slate-200">
        Node{" "}
        {String(props.entry.node_id ?? props.entry.defindex ?? "available")}
      </p>
      <p class="mt-1 text-xs text-slate-500">
        Stars{" "}
        {
          [
            props.entry.star_0_earned,
            props.entry.star_1_earned,
            props.entry.star_2_earned,
          ].filter(Boolean).length
        }
        /3 {" · "}
        {props.entry.loot_claimed === true
          ? "Reward claimed"
          : "Reward unclaimed"}
      </p>
    </div>
  );
}

function TF2QuestRewardCard(props: {
  entry: TF2FeatureSnapshot["questRewards"][number];
}) {
  return (
    <div class="rounded-lg border border-slate-800 bg-slate-950 p-3">
      <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">
        Quest reward purchase
      </p>
      <p class="mt-1 text-sm text-slate-200">
        Reward {String(props.entry.defindex ?? "recorded")}
      </p>
      <p class="mt-1 text-xs text-slate-500">
        Count {String(props.entry.count ?? 1)} · cycle{" "}
        {String(props.entry.map_cycle ?? "unavailable")}
      </p>
    </div>
  );
}

function TF2ActivityEntryCard(props: {
  entry: TF2ActivityEntry;
  snapshot: GameInventorySnapshot | undefined;
  dismissActivity: (key: string) => void;
}) {
  const ownedItem = () => {
    const definitionId = Number(props.entry.data.def_index ?? 0);
    return (props.snapshot?.items ?? []).find(
      (item) => item.definitionId === definitionId,
    );
  };

  return (
    <div class="rounded-lg border border-slate-800 bg-slate-950 p-3">
      <div class="flex items-start justify-between gap-2">
        <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">
          {props.entry.kind.replaceAll("_", " ")}
        </p>
        <button
          class="text-xs text-slate-600 hover:text-slate-300"
          onClick={() =>
            props.dismissActivity(`${props.entry.kind}:${props.entry.id ?? ""}`)
          }
        >
          Dismiss
        </button>
      </div>
      <p class="mt-1 text-sm text-slate-200">
        {activityDescription(props.entry, ownedItem()?.name)}
      </p>
      <Show when={props.entry.timestamp}>
        <p class="mt-1 text-xs text-slate-500">
          {new Date(props.entry.timestamp! * 1000).toLocaleString()}
        </p>
      </Show>
    </div>
  );
}

function TF2MatchmakingCard() {
  return (
    <div class="rounded-lg border border-slate-800 bg-slate-950 p-3">
      <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">
        Matchmaking context
      </p>
      <p class="mt-1 text-sm text-slate-200">
        Population and datacenter state received
      </p>
      <p class="mt-1 text-xs text-slate-500">
        Coordinator availability is shown only when supplied; missing regions
        are not treated as zero population.
      </p>
    </div>
  );
}

export function TF2ActivityCards(props: TF2ActivityCardsProps) {
  return (
    <div class="mt-4 grid gap-2 sm:grid-cols-2">
      <For each={props.tf2Features?.matches ?? []}>
        {(entry) => <TF2MatchActivityCard entry={entry} />}
      </For>
      <For each={props.tf2Features?.quests ?? []}>
        {(entry) => <TF2QuestCard entry={entry} />}
      </For>
      <For each={props.tf2Features?.questNodes ?? []}>
        {(entry) => <TF2QuestNodeCard entry={entry} />}
      </For>
      <For each={props.tf2Features?.questRewards ?? []}>
        {(entry) => <TF2QuestRewardCard entry={entry} />}
      </For>
      <For each={props.tf2Activity}>
        {(entry) => (
          <TF2ActivityEntryCard
            entry={entry}
            snapshot={props.snapshot}
            dismissActivity={props.dismissActivity}
          />
        )}
      </For>
      <Show when={props.tf2Features?.matchmaking}>
        <TF2MatchmakingCard />
      </Show>
    </div>
  );
}
