import { For, Show } from "solid-js";
import type { RevealAnimationMode } from "@cs-inv-edit/contracts";
import type { RevealItem } from "../../shared/ui/RevealAnimation.js";
import { Select } from "../../shared/ui/Select.js";
import { Button } from "../../shared/ui/Button.js";
import { isOption } from "../../shared/lib/options.js";

type RevealSelectionMode =
  | RevealAnimationMode
  | "contract-none"
  | "contract-countdown"
  | "contract-slot-machine";

const revealSelectionModes = [
  "none",
  "countdown",
  "slot-machine",
  "contract-none",
  "contract-countdown",
  "contract-slot-machine",
] as const satisfies readonly RevealSelectionMode[];

function collectionOptionLabel(name: string, itemCount: number) {
  return `${name} (${itemCount} items)`;
}

function CollectionOption(props: { name: string; itemCount: number }) {
  return (
    <option value={props.name}>
      {collectionOptionLabel(props.name, props.itemCount)}
    </option>
  );
}

function AnimationModeSelect(props: {
  label: string;
  value: RevealSelectionMode;
  keyName: "container" | "tradeUp" | "armory" | "terminal";
  onChange: (mode: RevealSelectionMode) => void;
}) {
  return (
    <label class="space-y-1.5 text-sm">
      <span class="text-slate-300">{props.label}</span>
      <Select
        class="w-full"
        value={props.value}
        onChange={(event) => {
          const value = event.currentTarget.value;
          if (isOption(value, revealSelectionModes)) props.onChange(value);
        }}
      >
        <option value="none">No animation</option>
        <option value="countdown">Countdown</option>
        <option value="slot-machine">Slot machine</option>
        <Show when={props.keyName === "tradeUp"}>
          <option value="contract-none">Contract + no animation</option>
          <option value="contract-countdown">Contract + countdown</option>
          <option value="contract-slot-machine">Contract + slot machine</option>
        </Show>
      </Select>
    </label>
  );
}

function DebugPreviewSection(props: {
  selectedDebugCollection: () => string;
  debugCollections: () => Array<[string, RevealItem[]]>;
  setDebugCollection: (value: string) => void;
  selectedDebugCandidates: () => RevealItem[];
  playDebugAnimation: (mode: Exclude<RevealAnimationMode, "none">) => void;
}) {
  return (
    <div class="mt-4 border-t border-slate-800 pt-3">
      <p class="text-xs font-medium uppercase tracking-wide text-slate-400">
        Debug previews
      </p>
      <p class="mt-1 text-xs text-slate-500">
        Play a reveal locally using loaded CS2 collection metadata, or three
        offline fallbacks when metadata is unavailable. This does not save
        settings or perform an operation.
      </p>
      <label class="mt-3 block space-y-1.5 text-sm">
        <span class="text-slate-300">Collection</span>
        <Select
          class="w-full"
          value={props.selectedDebugCollection()}
          disabled={props.debugCollections().length === 0}
          onChange={(event) =>
            props.setDebugCollection(event.currentTarget.value)
          }
        >
          <For each={props.debugCollections()}>
            {([name, items]) => (
              <CollectionOption name={name} itemCount={items.length} />
            )}
          </For>
          <Show when={props.debugCollections().length === 0}>
            <option value="">No collections loaded</option>
          </Show>
        </Select>
      </label>
      <div class="mt-3 flex flex-wrap gap-2">
        <Button
          variant="outline"
          disabled={props.selectedDebugCandidates().length === 0}
          class="rounded-full"
          onClick={() => props.playDebugAnimation("countdown")}
        >
          Play countdown
        </Button>
        <Button
          variant="outline"
          disabled={props.selectedDebugCandidates().length === 0}
          class="rounded-full"
          onClick={() => props.playDebugAnimation("slot-machine")}
        >
          Play slot machine
        </Button>
      </div>
    </div>
  );
}

export function RevealSettingsSection(props: {
  animationMode: (
    key: import("../../shared/ui-types.js").SettingsRevealKey,
  ) => RevealSelectionMode;
  setAnimationMode: (
    key: import("../../shared/ui-types.js").SettingsRevealKey,
    mode: RevealSelectionMode,
  ) => void;
  selectedDebugCollection: () => string;
  debugCollections: () => Array<[string, RevealItem[]]>;
  setDebugCollection: (value: string) => void;
  selectedDebugCandidates: () => RevealItem[];
  playDebugAnimation: (mode: Exclude<RevealAnimationMode, "none">) => void;
}) {
  return (
    <section class="border-b border-slate-800 pb-5 last:border-b-0 last:pb-0">
      <h4 class="text-sm font-semibold text-slate-100">Reveal animations</h4>
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
            <AnimationModeSelect
              label={entry.label}
              value={props.animationMode(entry.key)}
              keyName={entry.key}
              onChange={(mode) => props.setAnimationMode(entry.key, mode)}
            />
          )}
        </For>
      </div>
      <DebugPreviewSection
        selectedDebugCollection={props.selectedDebugCollection}
        debugCollections={props.debugCollections}
        setDebugCollection={props.setDebugCollection}
        selectedDebugCandidates={props.selectedDebugCandidates}
        playDebugAnimation={props.playDebugAnimation}
      />
    </section>
  );
}
