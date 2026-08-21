import { Show, type Accessor } from "solid-js";
import type {
  EconomyInventorySource,
  GameInventorySnapshot,
  OperationReceipt,
  TF2FeatureSnapshot,
} from "@cs-inv-edit/contracts";
import { TF2ActivityCards } from "../tf2/tf2-activity-sections.js";

interface TF2ActivityEntry {
  kind: string;
  id?: string | number;
  data: Record<string, unknown>;
  timestamp?: number;
}

export interface GameInventoryTF2ActivityProps {
  game: EconomyInventorySource;
  showTF2Activity?: boolean;
  matchGroup: Accessor<number>;
  setMatchGroup: (value: number) => void;
  submitTF2Operation: (
    type: string,
    input: unknown,
  ) => Promise<OperationReceipt | undefined>;
  tf2Features: TF2FeatureSnapshot | undefined;
  tf2Activity: Accessor<TF2ActivityEntry[]>;
  snapshot: Accessor<GameInventorySnapshot | undefined>;
  dismissActivity: (key: string) => void;
}

export function GameInventoryTF2Activity(props: GameInventoryTF2ActivityProps) {
  const loadHistory = () =>
    void props.submitTF2Operation("tf2.matches.load", {
      game: "tf2",
      matchGroup: props.matchGroup(),
    });
  const refreshContext = () =>
    void props.submitTF2Operation("tf2.matches.stats", { game: "tf2" });
  const selectMatchGroup = (
    event: Event & { currentTarget: HTMLSelectElement },
  ) => props.setMatchGroup(Number(event.currentTarget.value));
  if (props.game !== "tf2" || !props.showTF2Activity) return null;

  return (
    <details class="rounded-xl border border-slate-800 bg-slate-900">
      <summary class="cursor-pointer px-4 py-3 text-sm font-medium text-slate-200">
        Activity and progression{" "}
        <span class="ml-1 text-xs font-normal text-slate-500">
          matches, contracts, notifications, and XP
        </span>
      </summary>
      <div class="border-t border-slate-800 p-4">
        <div class="flex flex-wrap items-end gap-2">
          <label class="grid gap-1 text-xs text-slate-400">
            <span>Match history</span>
            <select
              class="h-9 rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-200"
              value={props.matchGroup()}
              onInput={selectMatchGroup}
            >
              <option value="7">Casual 12v12</option>
              <option value="6">Casual 9v9</option>
              <option value="5">Casual 6v6</option>
              <option value="4">Competitive 12v12</option>
              <option value="3">Competitive 9v9</option>
              <option value="2">Competitive 6v6</option>
              <option value="1">Mann Up</option>
              <option value="0">MvM Practice</option>
            </select>
          </label>
          <button
            class="h-9 rounded-lg border border-slate-700 bg-slate-800 px-3 text-sm text-slate-200 hover:bg-slate-700"
            onClick={loadHistory}
          >
            Load history
          </button>
          <button
            class="h-9 rounded-lg border border-slate-700 bg-slate-800 px-3 text-sm text-slate-200 hover:bg-slate-700"
            onClick={refreshContext}
          >
            Refresh matchmaking context
          </button>
        </div>
        <Show
          when={
            props.tf2Activity().length > 0 ||
            (props.tf2Features?.matches.length ?? 0) > 0 ||
            (props.tf2Features?.quests.length ?? 0) > 0 ||
            (props.tf2Features?.questNodes.length ?? 0) > 0 ||
            (props.tf2Features?.questRewards.length ?? 0) > 0
          }
          fallback={
            <p class="mt-4 text-sm text-slate-500">
              No match, contract, notification, or XP activity has arrived from
              the TF2 Game Coordinator in this session.
            </p>
          }
        >
          <TF2ActivityCards
            tf2Features={props.tf2Features}
            tf2Activity={props.tf2Activity()}
            snapshot={props.snapshot()}
            dismissActivity={props.dismissActivity}
          />
        </Show>
      </div>
    </details>
  );
}
