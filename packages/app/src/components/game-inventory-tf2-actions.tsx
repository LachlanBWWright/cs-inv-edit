import { For, Show, type Accessor } from "solid-js";
import type { EconomyInventoryItemDto } from "@cs-inv-edit/contracts";
import { TF2StrangeWorkshop } from "./TF2StrangeWorkshop.js";
import type { GameInventoryViewProps } from "./GameInventoryView.js";
import type { createGameInventoryModel } from "./game-inventory-model.js";

export function GameInventoryTF2Actions(input: { props: GameInventoryViewProps; model: ReturnType<typeof createGameInventoryModel>; item: Accessor<EconomyInventoryItemDto> }) {
  const props = input.props;
  const item = input.item;
  const { operationStatus, confirmUseItemId, setConfirmUseItemId, confirmStrangeResetId, setConfirmStrangeResetId, inspectRequestedAt, snapshot, selectedTF2Details, selectedTF2Item, previewTF2Container, submitTF2Operation, resolveTF2Inspect, inspectedTF2Item } = input.model;
  return (
    <>
                <Show when={item().game === "tf2"}>
                  <div class="mt-4 space-y-2 border-t border-slate-800 pt-4">
                    <Show when={item().inspectUrl}>
                      <button
                        type="button"
                        class="block w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-center text-sm text-slate-200 hover:bg-slate-800"
                        onClick={() =>
                          void resolveTF2Inspect(item().inspectUrl ?? "")
                        }
                      >
                        Resolve inspect details
                      </button>
                    </Show>
                    <Show when={inspectRequestedAt() > 0 && !inspectedTF2Item()}>
                      <p class="text-xs text-slate-500">
                        Waiting for the TF2 Game Coordinator to resolve this item…
                      </p>
                    </Show>
                    <Show when={inspectedTF2Item()}>
                      {(preview) => (
                        <div class="rounded-lg border border-slate-800 bg-slate-950 p-3">
                          <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Resolved inspect result
                          </p>
                          <p class="mt-1 text-sm text-slate-200">
                            Item {String(preview().id ?? "preview")}
                          </p>
                          <p class="mt-1 text-xs text-slate-500">
                            Definition {String(preview().definitionId ?? "unknown")}
                            {" · "}quality {String(preview().qualityId ?? "unknown")}
                            {" · "}level {String(preview().level ?? "unknown")}
                          </p>
                          <dl class="mt-3 grid grid-cols-2 gap-2 text-xs">
                            <div><dt class="text-slate-600">Original item</dt><dd class="break-all text-slate-300">{String(preview().originalId ?? "Unavailable")}</dd></div>
                            <div><dt class="text-slate-600">Style</dt><dd class="text-slate-300">{String(preview().style ?? "Default")}</dd></div>
                            <div><dt class="text-slate-600">Custom name</dt><dd class="text-slate-300">{String(preview().customName ?? "None")}</dd></div>
                            <div><dt class="text-slate-600">Equipped states</dt><dd class="text-slate-300">{preview().equippedStates.length}</dd></div>
                            <div><dt class="text-slate-600">Attributes</dt><dd class="text-slate-300">{preview().attributes.length}</dd></div>
                            <div><dt class="text-slate-600">Nested item</dt><dd class="text-slate-300">{preview().interiorItem ? "Present" : "None"}</dd></div>
                          </dl>
                          <Show when={props.tf2Features?.inspectedAt}>
                            <p class="mt-2 text-xs text-slate-600">Resolved {new Date(props.tf2Features!.inspectedAt!).toLocaleString()}</p>
                          </Show>
                        </div>
                      )}
                    </Show>
                    <Show when={props.settings?.featureFlags.enableTf2Tools && selectedTF2Details()?.schemaQuality?.toLowerCase() === "strange" && confirmStrangeResetId() !== item().assetId}>
                      <button class="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800" onClick={() => setConfirmStrangeResetId(item().assetId)}>Reset Strange counters</button>
                    </Show>
                    <Show
                      when={
                        props.settings?.featureFlags.enableTf2Tools &&
                        selectedTF2Item() &&
                        selectedTF2Details()?.schemaQuality?.toLowerCase() ===
                          "strange" &&
                        props.onOperation
                      }
                    >
                      <TF2StrangeWorkshop
                        item={selectedTF2Item()!}
                        items={(snapshot()?.items ?? []).filter(
                          (candidate): candidate is Extract<
                            EconomyInventoryItemDto,
                            { game: "tf2" }
                          > => candidate.game === "tf2",
                        )}
                        enabled={
                          props.settings?.featureFlags.enableTf2Tools === true
                        }
                        onOperation={props.onOperation!}
                      />
                    </Show>
                    <Show when={confirmStrangeResetId() === item().assetId}>
                      <div class="rounded-lg border border-red-900 bg-slate-950 p-3"><p class="text-xs text-slate-300">Reset every Strange counter on this item permanently?</p><div class="mt-2 flex gap-2"><button class="rounded-lg bg-red-800 px-3 py-1.5 text-xs text-white" onClick={() => { setConfirmStrangeResetId(undefined); void submitTF2Operation("tf2.tools.strange-reset", { game: "tf2", itemId: item().assetId, confirmed: true }); }}>Reset counters</button><button class="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300" onClick={() => setConfirmStrangeResetId(undefined)}>Cancel</button></div></div>
                    </Show>
                    <Show
                      when={
                        props.settings?.featureFlags.enableTf2ItemUse &&
                        confirmUseItemId() !== item().assetId
                      }
                    >
                      <button
                        type="button"
                        class="w-full rounded-xl border border-amber-500/40 bg-amber-950 px-3 py-2 text-sm text-amber-100"
                        onClick={() => setConfirmUseItemId(item().assetId)}
                      >
                        Use TF2 item
                      </button>
                    </Show>
                    <Show
                      when={
                        props.settings?.featureFlags.enableTf2ItemUse &&
                        confirmUseItemId() === item().assetId
                      }
                    >
                      <div class="rounded-xl border border-red-500/40 bg-red-950 p-3">
                        <p class="text-xs text-red-100">
                          This permanently consumes or changes {item().name}.
                          Confirm the exact item ID{" "}
                          <span class="font-mono">{item().assetId}</span>.
                        </p>
                        <div class="mt-2 flex gap-2">
                          <button
                            type="button"
                            class="rounded-lg bg-red-700 px-3 py-1.5 text-xs text-white"
                            onClick={() => {
                              setConfirmUseItemId(undefined);
                              void submitTF2Operation("tf2.items.use", {
                                game: "tf2",
                                itemId: item().assetId,
                                confirmed: true,
                              });
                            }}
                          >
                            Confirm permanent use
                          </button>
                          <button
                            type="button"
                            class="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300"
                            onClick={() => setConfirmUseItemId(undefined)}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    </Show>
                    <Show when={selectedTF2Details()?.itemKind === "container"}>
                      <p class="text-xs text-slate-500">
                        TF2 unboxing remains capture-gated. Enabling its
                        permanent-action flag does not bypass the backend
                        protocol-evidence block.
                      </p>
                    </Show>
                    <Show
                      when={
                        selectedTF2Details()?.itemKind === "container" &&
                        selectedTF2Details()?.containerItems?.length
                      }
                    >
                      <details class="rounded-xl border border-slate-800 p-3">
                        <summary class="cursor-pointer text-sm font-medium text-slate-300">
                          Possible schema contents (
                          {selectedTF2Details()?.containerItems?.length})
                        </summary>
                        <ul class="mt-2 max-h-52 space-y-1 overflow-y-auto text-xs text-slate-400">
                          <For each={selectedTF2Details()?.containerItems}>
                            {(entry) => (
                              <li class="grid grid-cols-[2rem_1fr_auto] items-center gap-2">
                                <Show
                                  when={entry.imageUrl}
                                  fallback={
                                    <div class="grid h-8 w-8 place-items-center rounded bg-slate-900 text-slate-600">
                                      ?
                                    </div>
                                  }
                                >
                                  {(url) => (
                                    <img
                                      class="h-8 w-8 rounded bg-slate-900 object-contain"
                                      src={url()}
                                      alt=""
                                      loading="lazy"
                                      referrerpolicy="no-referrer"
                                    />
                                  )}
                                </Show>
                                <span>{entry.name}</span>
                                <span>
                                  {entry.poolKind === "unresolved"
                                    ? "unresolved"
                                    : entry.rarity || "unknown rarity"}
                                </span>
                              </li>
                            )}
                          </For>
                        </ul>
                        <p class="mt-2 text-xs text-slate-500">
                          Possible contents only. Exact odds and bonus-drop
                          behavior are not inferred.
                        </p>
                      </details>
                    </Show>
                    <Show
                      when={
                        props.settings?.featureFlags.enableTf2Unboxing &&
                        selectedTF2Details()?.itemKind === "container" &&
                        selectedTF2Details()?.containerItems?.some(
                          (entry) => entry.poolKind !== "unresolved",
                        )
                      }
                    >
                      <button
                        type="button"
                        class="w-full rounded-xl border border-violet-500/40 bg-violet-950 px-3 py-2 text-sm text-violet-100"
                        onClick={previewTF2Container}
                      >
                        Preview unboxing animation
                      </button>
                      <p class="text-xs text-slate-500">
                        Offline preview only; no item is consumed or awarded.
                      </p>
                    </Show>
                    <Show when={operationStatus()}>
                      <p class="text-xs text-slate-400">{operationStatus()}</p>
                    </Show>
                  </div>
                </Show>
    </>
  );
}
