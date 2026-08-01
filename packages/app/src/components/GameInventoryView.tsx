import { For, Show } from "solid-js";
import type {
  EconomyInventorySource,
  GameInventorySnapshot,
  OperationReceipt,
  PriceScanResult,
  ProtocolTraceEntry,
  SettingsData,
  TF2FeatureSnapshot,
} from "@cs-inv-edit/contracts";
import { Alert } from "./ui/Alert.js";
import { InventoryLoadingState } from "./ui/InventoryLoadingState.js";
import { PullToRefresh } from "./ui/PullToRefresh.js";
import { ResponsiveInspector } from "./ui/ResponsiveInspector.js";
import { economyOutlineClass } from "./game-inventory-utils.js";
import type { EconomyInventorySort } from "./game-inventory-utils.js";
import { ItemMarketBadges } from "./ItemMarketBadges.js";
import { RevealAnimation } from "./ui/RevealAnimation.js";
import { TF2ItemEffectBadges } from "./TF2ItemEffectBadges.js";

import {
  economyInventoryLoadingStages,
  ItemImage,
} from "./game-inventory-elements.js";
import { createGameInventoryModel } from "./game-inventory-model.js";
import { GameInventoryDetails } from "./game-inventory-details.js";

export interface GameInventoryViewProps {
  game: EconomyInventorySource;
  loading: boolean;
  snapshot?: GameInventorySnapshot;
  connected?: boolean;
  steamId?: string;
  settings?: SettingsData;
  query: string;
  tagFilter: string;
  selectedAssetId?: string;
  setSelectedAssetId: (id: string | undefined) => void;
  compactMode: "icons" | "concise" | "detailed";
  sort: EconomyInventorySort;
  onRefresh: () => void;
  onScanPrices: (
    marketNames: string[],
    appId?: number,
  ) => Promise<PriceScanResult | undefined>;
  onOperation?: (type: string, input: unknown) => Promise<OperationReceipt>;
  tf2Features?: TF2FeatureSnapshot;
  showTF2Activity?: boolean;
  protocolEntries?: ProtocolTraceEntry[];
}

export function GameInventoryView(props: GameInventoryViewProps) {
  const model = createGameInventoryModel(props);
  const {
    matchGroup,
    setMatchGroup,
    marketPrices,
    tf2ContainerPreview,
    setTF2ContainerPreview,
    snapshot,
    title,
    items,
    selected,
    dismissActivity,
    tf2Activity,
    submitTF2Operation,
  } = model;
  return (
    <div class="flex min-h-0 flex-1 flex-col gap-4">
      <Show
        when={
          snapshot()?.status === "requires_connection" &&
          props.connected === false
        }
      >
        <Alert variant="warning">
          Connect a Steam account, then refresh this inventory.
        </Alert>
      </Show>
      <Show when={snapshot()?.status === "error"}>
        <Alert variant="danger">
          {snapshot()?.error || "Inventory loading failed"}
        </Alert>
      </Show>
      <Show when={props.game === "tf2" && props.showTF2Activity}>
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
                  value={matchGroup()}
                  onInput={(event) =>
                    setMatchGroup(Number(event.currentTarget.value))
                  }
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
                onClick={() =>
                  void submitTF2Operation("tf2.matches.load", {
                    game: "tf2",
                    matchGroup: matchGroup(),
                  })
                }
              >
                Load history
              </button>
              <button
                class="h-9 rounded-lg border border-slate-700 bg-slate-800 px-3 text-sm text-slate-200 hover:bg-slate-700"
                onClick={() =>
                  void submitTF2Operation("tf2.matches.stats", { game: "tf2" })
                }
              >
                Refresh matchmaking context
              </button>
            </div>
            <Show
              when={
                tf2Activity().length > 0 ||
                (props.tf2Features?.matches.length ?? 0) > 0 ||
                (props.tf2Features?.quests.length ?? 0) > 0 ||
                (props.tf2Features?.questNodes.length ?? 0) > 0 ||
                (props.tf2Features?.questRewards.length ?? 0) > 0
              }
              fallback={
                <p class="mt-4 text-sm text-slate-500">
                  No match, contract, notification, or XP activity has arrived
                  from the TF2 Game Coordinator in this session.
                </p>
              }
            >
              <div class="mt-4 grid gap-2 sm:grid-cols-2">
                <For each={props.tf2Features?.matches ?? []}>
                  {(entry) => (
                    <div class="rounded-lg border border-slate-800 bg-slate-950 p-3">
                      <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Match result
                      </p>
                      <p class="mt-1 text-sm text-slate-200">
                        Match{" "}
                        {String(entry.match_id ?? entry.matchId ?? "recorded")}
                      </p>
                      <p class="mt-1 text-xs text-slate-500">
                        Map {String(entry.map_index ?? "unavailable")} · group{" "}
                        {String(entry.match_group ?? "unavailable")} · season{" "}
                        {String(entry.season_id ?? "unavailable")}
                      </p>
                      <dl class="mt-3 grid grid-cols-3 gap-2 text-xs">
                        <For
                          each={
                            [
                              ["Score", entry.score],
                              ["Kills", entry.kills],
                              ["Deaths", entry.deaths],
                              ["Damage", entry.damage],
                              ["Healing", entry.healing],
                              ["Support", entry.support],
                              ["Rating", entry.display_rating],
                              ["Change", entry.display_rating_change],
                              ["Party", entry.original_party_id],
                            ] as const
                          }
                        >
                          {([label, value]) => (
                            <div>
                              <dt class="text-slate-600">{label}</dt>
                              <dd class="text-slate-300">
                                {value === undefined
                                  ? "Unavailable"
                                  : String(value)}
                              </dd>
                            </div>
                          )}
                        </For>
                      </dl>
                    </div>
                  )}
                </For>
                <For each={props.tf2Features?.quests ?? []}>
                  {(entry) => (
                    <div class="rounded-lg border border-slate-800 bg-slate-950 p-3">
                      <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Contract
                      </p>
                      <p class="mt-1 text-sm text-slate-200">
                        Quest{" "}
                        {String(
                          entry.quest_id ??
                            entry.questId ??
                            entry.id ??
                            "active",
                        )}
                      </p>
                      <p class="mt-1 text-xs text-slate-500">
                        {entry.active === false
                          ? "Completed or inactive"
                          : "Active"}
                        {" · "}objectives {String(entry.points_0 ?? "—")} /{" "}
                        {String(entry.points_1 ?? "—")} /{" "}
                        {String(entry.points_2 ?? "—")}
                      </p>
                    </div>
                  )}
                </For>
                <For each={props.tf2Features?.questNodes ?? []}>
                  {(entry) => (
                    <div class="rounded-lg border border-slate-800 bg-slate-950 p-3">
                      <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Quest-map node
                      </p>
                      <p class="mt-1 text-sm text-slate-200">
                        Node{" "}
                        {String(entry.node_id ?? entry.defindex ?? "available")}
                      </p>
                      <p class="mt-1 text-xs text-slate-500">
                        Stars{" "}
                        {
                          [
                            entry.star_0_earned,
                            entry.star_1_earned,
                            entry.star_2_earned,
                          ].filter(Boolean).length
                        }
                        /3
                        {" · "}
                        {entry.loot_claimed === true
                          ? "Reward claimed"
                          : "Reward unclaimed"}
                      </p>
                    </div>
                  )}
                </For>
                <For each={props.tf2Features?.questRewards ?? []}>
                  {(entry) => (
                    <div class="rounded-lg border border-slate-800 bg-slate-950 p-3">
                      <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Quest reward purchase
                      </p>
                      <p class="mt-1 text-sm text-slate-200">
                        Reward {String(entry.defindex ?? "recorded")}
                      </p>
                      <p class="mt-1 text-xs text-slate-500">
                        Count {String(entry.count ?? 1)} · cycle{" "}
                        {String(entry.map_cycle ?? "unavailable")}
                      </p>
                    </div>
                  )}
                </For>
                <For each={tf2Activity()}>
                  {(entry) => {
                    const ownedItem = () => {
                      const definitionId = Number(entry.data.def_index ?? 0);
                      return (snapshot()?.items ?? []).find(
                        (item) => item.definitionId === definitionId,
                      );
                    };
                    return (
                      <div class="rounded-lg border border-slate-800 bg-slate-950 p-3">
                        <div class="flex items-start justify-between gap-2">
                          <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            {entry.kind.replaceAll("_", " ")}
                          </p>
                          <button
                            class="text-xs text-slate-600 hover:text-slate-300"
                            onClick={() =>
                              dismissActivity(`${entry.kind}:${entry.id ?? ""}`)
                            }
                          >
                            Dismiss
                          </button>
                        </div>
                        <p class="mt-1 text-sm text-slate-200">
                          {entry.kind === "item_pickup"
                            ? (ownedItem()?.name ??
                              `Item definition ${String(entry.data.def_index ?? "unknown")}`)
                            : String(
                                entry.data.notification_string ??
                                  (entry.id
                                    ? `Record ${entry.id}`
                                    : "New TF2 activity"),
                              )}
                        </p>
                        <Show when={entry.timestamp}>
                          <p class="mt-1 text-xs text-slate-500">
                            {new Date(entry.timestamp! * 1000).toLocaleString()}
                          </p>
                        </Show>
                      </div>
                    );
                  }}
                </For>
                <Show when={props.tf2Features?.matchmaking}>
                  <div class="rounded-lg border border-slate-800 bg-slate-950 p-3">
                    <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Matchmaking context
                    </p>
                    <p class="mt-1 text-sm text-slate-200">
                      Population and datacenter state received
                    </p>
                    <p class="mt-1 text-xs text-slate-500">
                      Coordinator availability is shown only when supplied;
                      missing regions are not treated as zero population.
                    </p>
                  </div>
                </Show>
              </div>
            </Show>
          </div>
        </details>
      </Show>
      <div class="grid flex-1 items-start gap-4 lg:grid-cols-[minmax(320px,0.95fr)_minmax(0,1fr)]">
        <ResponsiveInspector
          open={!!props.selectedAssetId}
          selectionKey={selected()?.assetId}
          label="Selected economy item details"
          summary={
            <div class="min-w-0">
              <p class="truncate text-sm font-semibold text-slate-100">
                {selected()?.name ?? "Selected item"}
              </p>
              <p class="mt-0.5 truncate text-xs text-slate-500">
                {[selected()?.type, selected()?.rarity]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
          }
        >
          <GameInventoryDetails props={props} model={model} />
        </ResponsiveInspector>
        <PullToRefresh
          class="pb-24 lg:order-2 lg:pb-0"
          onRefresh={props.onRefresh}
        >
          <div
            class="grid gap-3"
            style={{
              "grid-template-columns": "repeat(auto-fill, minmax(190px, 1fr))",
            }}
          >
            <For each={items()}>
              {(item) => (
                <button
                  type="button"
                  class={
                    item.game === "tf2"
                      ? `inventory-item-card rarity-outline group relative flex cursor-pointer flex-col overflow-hidden rounded-2xl border-2 bg-slate-950 text-left transition focus:outline-none focus:ring-2 focus:ring-cyan-400/50 ${economyOutlineClass(item)} ${selected()?.assetId === item.assetId ? "is-selected ring-2 ring-cyan-300" : "hover:brightness-110"}`
                      : `inventory-item-card rarity-outline group relative flex cursor-pointer flex-col overflow-hidden rounded-2xl border-2 bg-slate-950 text-left transition duration-150 focus:outline-none focus:ring-2 focus:ring-cyan-400/50 ${economyOutlineClass(item)} ${selected()?.assetId === item.assetId ? "is-selected ring-2 ring-cyan-300" : "hover:brightness-110"}`
                  }
                  aria-pressed={selected()?.assetId === item.assetId}
                  onClick={() => props.setSelectedAssetId(item.assetId)}
                >
                  <ItemMarketBadges
                    item={item}
                    priceMinor={marketPrices().get(item.marketName ?? "")}
                  />
                  <Show when={item.game === "tf2"}>
                    <TF2ItemEffectBadges item={item} />
                  </Show>
                  <ItemImage item={item} card />
                  <div
                    class={
                      props.compactMode === "icons"
                        ? "flex flex-1 flex-col px-3 py-3 text-center"
                        : "flex flex-1 flex-col px-3 py-3"
                    }
                  >
                    <p
                      class={`${props.compactMode === "icons" ? "text-xs" : "text-base"} line-clamp-2 font-medium leading-tight text-slate-100`}
                      title={item.name}
                    >
                      {item.name}
                    </p>
                    <Show when={props.compactMode !== "icons"}>
                      <Show when={item.details.customName}>
                        <p class="mt-1 truncate text-sm text-cyan-200">
                          “{item.details.customName}”
                        </p>
                      </Show>
                      <Show when={item.type || item.quality}>
                        <p class="mt-1 truncate text-sm text-slate-400">
                          {[item.type, item.quality]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </Show>
                    </Show>
                    <Show when={item.quantity > 1}>
                      <p class="mt-1 text-xs text-slate-400">
                        Quantity {item.quantity}
                      </p>
                    </Show>
                  </div>
                </button>
              )}
            </For>
          </div>
          <Show
            when={
              (props.loading || snapshot()?.status === "loading") &&
              (snapshot()?.items.length ?? 0) === 0
            }
          >
            <InventoryLoadingState
              active
              title={`Loading ${title()}`}
              stages={economyInventoryLoadingStages[props.game]}
              currentStage={snapshot()?.message}
            />
          </Show>
          <Show
            when={
              (snapshot()?.items.length ?? 0) > 0 && items().length === 0
            }
          >
            <p class="rounded-2xl border border-slate-800 p-5 text-sm text-slate-400">
              No matching items.
            </p>
          </Show>
        </PullToRefresh>
      </div>
      <RevealAnimation
        open={!!tf2ContainerPreview()}
        ready
        mode={props.settings?.animations?.container ?? "slot-machine"}
        title="TF2 unboxing preview"
        candidates={tf2ContainerPreview()?.candidates ?? []}
        result={tf2ContainerPreview()?.result ?? { name: "TF2 item" }}
        onComplete={() => setTF2ContainerPreview(undefined)}
      />
    </div>
  );
}
