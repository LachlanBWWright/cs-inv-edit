import type { JSX } from "solid-js";
import type { SettingsData } from "@cs-inv-edit/contracts";
import type { FeedbackTone } from "../../shared/ui-types.js";
import type { CompactMode } from "../../shared/ui-types.js";
import { Input } from "../../shared/ui/Input.js";
import { Button } from "../../shared/ui/Button.js";
import { Alert } from "../../shared/ui/Alert.js";
import { SettingsFeatureFlags } from "./SettingsFeatureFlags.js";
import { RevealSettingsSection } from "./settings-reveal-section.js";

function SettingsSectionFrame(props: {
  title: string;
  description?: string;
  children: JSX.Element;
}) {
  return (
    <section class="border-b border-slate-800 pb-5 last:border-b-0 last:pb-0">
      <h4 class="text-sm font-semibold text-slate-100">{props.title}</h4>
      {props.description ? (
        <p class="mt-1 text-xs text-slate-500">{props.description}</p>
      ) : null}
      <div class="mt-3 space-y-3 text-sm text-slate-400">
        {props.children}
      </div>
    </section>
  );
}

const displayModes: Array<{ value: CompactMode; label: string }> = [
  { value: "icons", label: "Icons" },
  { value: "concise", label: "Concise" },
  { value: "detailed", label: "Detailed" },
];

function DisplayModeButton(props: {
  mode: { value: CompactMode; label: string };
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      class={`rounded-lg border px-2 py-2 text-sm font-medium ${
        props.selected
          ? "border-cyan-400/40 bg-cyan-950 text-cyan-100"
          : "border-slate-700 bg-slate-950 text-slate-300"
      }`}
      aria-pressed={props.selected}
      onClick={props.onSelect}
    >
      {props.mode.label}
    </button>
  );
}

export function DisplaySettingsSection(props: {
  compactMode: CompactMode;
  onChange: (mode: CompactMode) => void;
}) {
  return (
    <SettingsSectionFrame
      title="Inventory display"
      description="Use the same item size for every game."
    >
      <div class="grid grid-cols-3 gap-2">
        {displayModes.map((mode) => (
          <DisplayModeButton
            mode={mode}
            selected={props.compactMode === mode.value}
            onSelect={() => props.onChange(mode.value)}
          />
        ))}
      </div>
    </SettingsSectionFrame>
  );
}

export function SettingsHeader(props: {
  hasChanges: boolean;
  saving: boolean;
  onRefresh: () => void;
  onSave: () => void;
}) {
  return (
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h3 class="text-lg font-semibold text-slate-50">Settings</h3>
        <p class="mt-1 text-sm text-slate-400">
          Backend URL, validation, and feature flags.
        </p>
      </div>
      <div class="flex gap-2">
        <Button
          variant="secondary"
          class="rounded-full"
          onClick={() => props.onRefresh()}
        >
          Reload
        </Button>
        <Button
          disabled={!props.hasChanges || props.saving}
          class="rounded-full"
          onClick={() => props.onSave()}
        >
          {props.saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}

export function SettingsStatusAlert(props: {
  status: string;
  variant: FeedbackTone;
}) {
  if (!props.status) return null;
  return (
    <Alert class="mt-3" variant={props.variant}>
      {props.status}
    </Alert>
  );
}

function NumberInputField(props: {
  value: number;
  onChange: (value: number) => void;
}) {
  const update: JSX.EventHandler<HTMLInputElement, InputEvent> = (event) => {
    const nextValue = Number(event.currentTarget.value || 5);
    props.onChange(nextValue);
  };

  return (
    <label class="flex items-center gap-3 text-sm">
      <Input
        type="number"
        min="1"
        max="60"
        class="w-24"
        value={String(props.value)}
        onInput={update}
      />
      <span class="text-slate-400">seconds</span>
    </label>
  );
}

export function ArmoryPacingSection(props: {
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <SettingsSectionFrame
      title="Armory purchase pacing"
      description="Delay between protobuf purchase messages during a bulk buy."
    >
      <NumberInputField value={props.value} onChange={props.onChange} />
    </SettingsSectionFrame>
  );
}

function ToggleField(props: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label class="flex items-center justify-between gap-3">
      <span class="text-slate-200">{props.label}</span>
      <input
        type="checkbox"
        checked={props.checked}
        onChange={(event) => props.onChange(event.currentTarget.checked)}
      />
    </label>
  );
}

export function BackendSettingsSection(props: {
  draft: SettingsData | undefined;
  onUpdate: (
    updater: (current: SettingsData | undefined) => SettingsData | undefined,
  ) => void;
}) {
  const updateBackendUrl: JSX.EventHandler<HTMLInputElement, InputEvent> = (
    event,
  ) => {
    const nextValue = event.currentTarget.value;
    props.onUpdate((current) =>
      current ? { ...current, backendUrl: nextValue } : current,
    );
  };

  const updateFlag =
    (key: "validationMode" | "sacrificialAccountMode") =>
    (checked: boolean) => {
      props.onUpdate((current) =>
        current ? { ...current, [key]: checked } : current,
      );
    };

  return (
    <SettingsSectionFrame title="Backend">
      <label class="flex flex-col gap-2">
        <span class="text-slate-200">Local backend URL</span>
        <Input
          value={props.draft?.backendUrl ?? ""}
          onInput={updateBackendUrl}
        />
      </label>
      <ToggleField
        label="Validation mode"
        checked={props.draft?.validationMode ?? false}
        onChange={updateFlag("validationMode")}
      />
      <ToggleField
        label="Sacrificial account mode"
        checked={props.draft?.sacrificialAccountMode ?? false}
        onChange={updateFlag("sacrificialAccountMode")}
      />
    </SettingsSectionFrame>
  );
}

export function FeatureFlagSection(props: {
  featureKeys: Array<keyof import("@cs-inv-edit/contracts").FeatureFlags>;
  draft: SettingsData | undefined;
  setFeature: (
    key: keyof import("@cs-inv-edit/contracts").FeatureFlags,
    value: boolean,
  ) => void;
  label: (key: keyof import("@cs-inv-edit/contracts").FeatureFlags) => string;
}) {
  return (
    <SettingsFeatureFlags
      keys={props.featureKeys}
      draft={props.draft}
      setFeature={props.setFeature}
      label={props.label}
    />
  );
}

export function RevealSettingsPanel(props: {
  animationMode: (
    key: import("../../shared/ui-types.js").SettingsRevealKey,
  ) =>
    | import("@cs-inv-edit/contracts").RevealAnimationMode
    | import("@cs-inv-edit/contracts").TradeUpAnimationMode;
  setAnimationMode: (
    key: import("../../shared/ui-types.js").SettingsRevealKey,
    value:
      | import("@cs-inv-edit/contracts").RevealAnimationMode
      | import("@cs-inv-edit/contracts").TradeUpAnimationMode,
  ) => void;
  selectedDebugCollection: () => string;
  debugCollections: () => Array<
    [string, import("../../shared/ui/RevealAnimation.js").RevealItem[]]
  >;
  setDebugCollection: (value: string) => void;
  selectedDebugCandidates: () => import("../../shared/ui/RevealAnimation.js").RevealItem[];
  playDebugAnimation: (
    mode: Exclude<import("@cs-inv-edit/contracts").RevealAnimationMode, "none">,
  ) => void;
}) {
  return (
    <RevealSettingsSection
      animationMode={props.animationMode}
      setAnimationMode={props.setAnimationMode}
      selectedDebugCollection={props.selectedDebugCollection}
      debugCollections={props.debugCollections}
      setDebugCollection={props.setDebugCollection}
      selectedDebugCandidates={props.selectedDebugCandidates}
      playDebugAnimation={props.playDebugAnimation}
    />
  );
}
