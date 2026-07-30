import { For, Show } from "solid-js";
import type { RevealAnimationMode } from "@cs-inv-edit/contracts";
import type { RevealItem } from "./ui/RevealAnimation.js";
import { Select } from "./ui/Select.js";

type RevealSelectionMode =
  | RevealAnimationMode
  | "contract-none"
  | "contract-countdown"
  | "contract-slot-machine";

export function RevealSettingsSection(props: {
  animationMode: (key: "container" | "tradeUp" | "armory" | "terminal") => RevealSelectionMode;
  setAnimationMode: (key: "container" | "tradeUp" | "armory" | "terminal", mode: RevealSelectionMode) => void;
  selectedDebugCollection: () => string;
  debugCollections: () => Array<[string, RevealItem[]]>;
  setDebugCollection: (value: string) => void;
  selectedDebugCandidates: () => RevealItem[];
  playDebugAnimation: (mode: Exclude<RevealAnimationMode, "none">) => void;
}) {
  return (
    <section class="rounded-2xl border border-slate-800/70 bg-slate-900/70 p-3">
          <h4 class="text-sm font-semibold text-slate-100">
            Reveal animations
          </h4>
          <p class="mt-1 text-xs text-slate-500">
            Choose an animation independently for each randomized operation.
          </p>
          <div class="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <For
              each={
                [
                  { key: "container", label: "Containers" },
                  { key: "tradeUp", label: "Trade-ups" },
                  { key: "armory", label: "Armory" },
                  { key: "terminal", label: "Terminals" },
                ] as const
              }
            >
              {(entry) => (
                <label class="space-y-1.5 text-sm">
                  <span class="text-slate-300">{entry.label}</span>
                  <Select
                    class="w-full"
                    value={props.animationMode(entry.key)}
                    onChange={(event) =>
                      props.setAnimationMode(
                        entry.key,
                        (event.currentTarget as HTMLSelectElement)
                          .value as RevealAnimationMode,
                      )
                    }
                  >
                    <option value="none">No animation</option>
                    <option value="countdown">Countdown</option>
                    <option value="slot-machine">Slot machine</option>
                    <Show when={entry.key === "tradeUp"}>
                      <option value="contract-none">
                        Contract + no animation
                      </option>
                      <option value="contract-countdown">
                        Contract + countdown
                      </option>
                      <option value="contract-slot-machine">
                        Contract + slot machine
                      </option>
                    </Show>
                  </Select>
                </label>
              )}
            </For>
          </div>
          <div class="mt-4 border-t border-slate-800 pt-3">
            <p class="text-xs font-medium uppercase tracking-wide text-slate-400">
              Debug previews
            </p>
            <p class="mt-1 text-xs text-slate-500">
              Play a reveal locally using loaded CS2 collection metadata, or
              three offline fallbacks when metadata is unavailable. This does
              not save settings or perform an operation.
            </p>
            <label class="mt-3 block space-y-1.5 text-sm">
              <span class="text-slate-300">Collection</span>
              <Select
                class="w-full"
                value={props.selectedDebugCollection()}
                disabled={props.debugCollections().length === 0}
                onChange={(event) =>
                  props.setDebugCollection(
                    (event.currentTarget as HTMLSelectElement).value,
                  )
                }
              >
                <For each={props.debugCollections()}>
                  {([name, items]) => (
                    <option value={name}>
                      {name} ({items.length} items)
                    </option>
                  )}
                </For>
                <Show when={props.debugCollections().length === 0}>
                  <option value="">No collections loaded</option>
                </Show>
              </Select>
            </label>
            <div class="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={props.selectedDebugCandidates().length === 0}
                class="rounded-full border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-200 transition hover:border-cyan-500/50 hover:text-cyan-100 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => props.playDebugAnimation("countdown")}
              >
                Play countdown
              </button>
              <button
                type="button"
                disabled={props.selectedDebugCandidates().length === 0}
                class="rounded-full border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-200 transition hover:border-cyan-500/50 hover:text-cyan-100 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => props.playDebugAnimation("slot-machine")}
              >
                Play slot machine
              </button>
            </div>
          </div>
    </section>
  );
}
