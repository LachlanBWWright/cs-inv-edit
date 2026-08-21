import { createEffect, createMemo, createSignal, onCleanup } from "solid-js";
import type {
  FeatureFlags,
  RevealAnimationMode,
  SettingsData,
  TradeUpAnimationMode,
} from "@cs-inv-edit/contracts";
import {
  MOCK_RESULT_DELAY_MS,
  randomRevealCandidate,
  RevealAnimation,
  type RevealItem,
} from "../../shared/ui/RevealAnimation.js";
import { appErrorMessage, fromAppPromise } from "../../shared/lib/result.js";

import {
  emptyDebugReveal,
  fallbackDebugCollections,
  featureFlagKeys,
  settingsEqual,
  type SettingsViewProps,
} from "./settings-view-model.js";
import {
  ArmoryPacingSection,
  BackendSettingsSection,
  DisplaySettingsSection,
  FeatureFlagSection,
  RevealSettingsPanel,
  SettingsHeader,
  SettingsStatusAlert,
} from "./settings-view-sections.js";
export {
  settingsEqual,
  type SettingsViewProps,
} from "./settings-view-model.js";
export function SettingsView(props: SettingsViewProps) {
  const [draft, setDraft] = createSignal<SettingsData | undefined>(
    props.settings,
  );
  const [savedSettings, setSavedSettings] = createSignal<
    SettingsData | undefined
  >(props.settings);
  const [status, setStatus] = createSignal<string>("");
  const [statusVariant, setStatusVariant] =
    createSignal<import("../../shared/ui-types.js").FeedbackTone>("default");
  const [saving, setSaving] = createSignal(false);
  const [debugAnimation, setDebugAnimation] = createSignal<
    RevealAnimationMode | undefined
  >();
  let debugResultTimer: number | undefined;
  onCleanup(() => {
    if (debugResultTimer !== undefined) window.clearTimeout(debugResultTimer);
  });
  const [debugCollection, setDebugCollection] = createSignal("");

  createEffect(() => {
    if (props.settings) {
      setDraft(props.settings);
      setSavedSettings(props.settings);
    }
  });

  const featureKeys = createMemo(() => {
    const flags = props.settings?.featureFlags ?? draft()?.featureFlags;
    return flags ? featureFlagKeys.filter((key) => key in flags) : [];
  });
  const hasChanges = createMemo(() => !settingsEqual(draft(), savedSettings()));
  const featureLabel = (key: keyof FeatureFlags) => {
    const words = key.replace(/([A-Z])/g, " $1").replace(/^enable /, "");
    return words.charAt(0).toUpperCase() + words.slice(1).toLowerCase();
  };
  const debugCollections = () => {
    if (props.inventory?.collections?.length) {
      return props.inventory.collections.map(
        (collection): [string, RevealItem[]] => [
          collection.name,
          collection.items.map((item) => ({
            name: item.marketName || item.name,
            imageUrl: item.imageUrl,
            rarity: item.rarity,
            kind: item.kind,
            wear: item.paintWear,
            wearMin: item.wearMin,
            wearMax: item.wearMax,
          })),
        ],
      );
    }
    const collections = new Map<string, RevealItem[]>();
    for (const item of props.inventory?.items ?? []) {
      if (!item.collection || !item.collectionItems?.length) continue;
      const existing = collections.get(item.collection) ?? [];
      for (const collectionItem of item.collectionItems) {
        if (
          !existing.some(
            (candidate) =>
              candidate.name ===
              (collectionItem.marketName || collectionItem.name),
          )
        ) {
          existing.push({
            name: collectionItem.marketName || collectionItem.name,
            imageUrl: collectionItem.imageUrl,
            rarity: collectionItem.rarity,
            kind: collectionItem.kind,
            wear: collectionItem.paintWear,
            wearMin: collectionItem.wearMin,
            wearMax: collectionItem.wearMax,
          });
        }
      }
      collections.set(item.collection, existing);
    }
    const available = [...collections.entries()].sort(([left], [right]) =>
      left.localeCompare(right),
    );
    return available.length > 0 ? available : fallbackDebugCollections;
  };
  const selectedDebugCollection = () =>
    debugCollection() || debugCollections()[0]?.[0] || "";
  const selectedDebugCandidates = () =>
    debugCollections().find(
      ([name]) => name === selectedDebugCollection(),
    )?.[1] ?? [];
  const updateArmoryPacing = (value: number) =>
    setDraft((current) =>
      current
        ? {
            ...current,
            armoryPurchasePacingSeconds: Math.min(
              60,
              Math.max(1, value || 5),
            ),
          }
        : current,
    );
  const playDebugAnimation = (mode: Exclude<RevealAnimationMode, "none">) => {
    const candidates = selectedDebugCandidates();
    if (candidates.length === 0) return;
    if (debugResultTimer !== undefined) window.clearTimeout(debugResultTimer);
    setDebugReveal({ candidates, result: emptyDebugReveal, ready: false });
    setDebugAnimation(mode);
    debugResultTimer = window.setTimeout(() => {
      setDebugReveal({
        candidates,
        result: randomRevealCandidate(candidates, emptyDebugReveal),
        ready: true,
      });
      debugResultTimer = undefined;
    }, MOCK_RESULT_DELAY_MS);
  };
  const [debugReveal, setDebugReveal] = createSignal<{
    candidates: RevealItem[];
    result: RevealItem;
    ready: boolean;
  }>({ candidates: [], result: emptyDebugReveal, ready: false });

  const updateDraft = (
    updater: (current: SettingsData | undefined) => SettingsData | undefined,
  ) => {
    setDraft((current) => updater(current));
  };

  const setFeature = (key: keyof FeatureFlags, value: boolean) => {
    updateDraft((current) =>
      current
        ? {
            ...current,
            featureFlags: { ...current.featureFlags, [key]: value },
          }
        : current,
    );
  };

  const animationMode = (
    key: import("../../shared/ui-types.js").SettingsRevealKey,
  ) => draft()?.animations?.[key] ?? "slot-machine";
  const setAnimationMode = (
    key: import("../../shared/ui-types.js").SettingsRevealKey,
    value: RevealAnimationMode | TradeUpAnimationMode,
  ) => {
    updateDraft((current) =>
      current
        ? {
            ...current,
            animations: {
              container: current.animations?.container ?? "slot-machine",
              tradeUp: current.animations?.tradeUp ?? "slot-machine",
              armory: current.animations?.armory ?? "slot-machine",
              terminal: current.animations?.terminal ?? "slot-machine",
              [key]: value,
            },
          }
        : current,
    );
  };

  const save = async () => {
    const value = draft();
    if (!value || !hasChanges() || saving()) return;
    setSaving(true);
    setStatus("Saving…");
    setStatusVariant("default");
    await fromAppPromise(props.onSave(value), "Settings save failed").match(
      (outcome) => {
        if (outcome.ok) {
          setSavedSettings(value);
          setStatus(outcome.message ?? "Settings updated");
          setStatusVariant("success");
          return;
        }
        setStatus(outcome.message);
        setStatusVariant("danger");
      },
      (error) => {
        const message = appErrorMessage(error, "Save failed");
        setStatus(message);
        setStatusVariant("danger");
      },
    );
    setSaving(false);
  };

  return (
    <div class="w-full max-w-full text-slate-200">
      <SettingsHeader
        hasChanges={hasChanges()}
        saving={saving()}
        onRefresh={() => props.onRefresh()}
        onSave={() => void save()}
      />

      <SettingsStatusAlert status={status()} variant={statusVariant()} />
      <SettingsSections
        draft={draft()}
        featureKeys={featureKeys()}
        setFeature={setFeature}
        label={featureLabel}
        animationMode={animationMode}
        setAnimationMode={setAnimationMode}
        selectedDebugCollection={selectedDebugCollection}
        debugCollections={debugCollections}
        setDebugCollection={setDebugCollection}
        selectedDebugCandidates={selectedDebugCandidates}
        playDebugAnimation={playDebugAnimation}
        onArmoryPacingChange={updateArmoryPacing}
        onUpdateDraft={setDraft}
        compactMode={props.compactMode}
        onCompactModeChange={props.onCompactModeChange}
      />
      <RevealAnimation
        open={debugAnimation() !== undefined}
        ready={debugReveal().ready}
        mode={debugAnimation() ?? "none"}
        title="Collection reveal preview"
        candidates={debugReveal().candidates}
        result={debugReveal().result}
        onComplete={() => setDebugAnimation(undefined)}
      />
    </div>
  );
}

function SettingsSections(props: {
  draft: SettingsData | undefined;
  featureKeys: Array<keyof FeatureFlags>;
  setFeature: (key: keyof FeatureFlags, value: boolean) => void;
  label: (key: keyof FeatureFlags) => string;
  animationMode: (
    key: import("../../shared/ui-types.js").SettingsRevealKey,
  ) => RevealAnimationMode | TradeUpAnimationMode;
  setAnimationMode: (
    key: import("../../shared/ui-types.js").SettingsRevealKey,
    value: RevealAnimationMode | TradeUpAnimationMode,
  ) => void;
  selectedDebugCollection: () => string;
  debugCollections: () => Array<[string, RevealItem[]]>;
  setDebugCollection: (value: string) => void;
  selectedDebugCandidates: () => RevealItem[];
  playDebugAnimation: (mode: Exclude<RevealAnimationMode, "none">) => void;
  onArmoryPacingChange: (value: number) => void;
  onUpdateDraft: (
    updater: (current: SettingsData | undefined) => SettingsData | undefined,
  ) => void;
  compactMode: import("../../shared/ui-types.js").CompactMode;
  onCompactModeChange: (
    mode: import("../../shared/ui-types.js").CompactMode,
  ) => void;
}) {
  return (
    <div class="mt-5 space-y-5">
      <DisplaySettingsSection
        compactMode={props.compactMode}
        onChange={props.onCompactModeChange}
      />
      <RevealSettingsPanel
        animationMode={props.animationMode}
        setAnimationMode={props.setAnimationMode}
        selectedDebugCollection={props.selectedDebugCollection}
        debugCollections={props.debugCollections}
        setDebugCollection={props.setDebugCollection}
        selectedDebugCandidates={props.selectedDebugCandidates}
        playDebugAnimation={props.playDebugAnimation}
      />
      <ArmoryPacingSection
        value={props.draft?.armoryPurchasePacingSeconds ?? 5}
        onChange={props.onArmoryPacingChange}
      />

      <BackendSettingsSection
        draft={props.draft}
        onUpdate={props.onUpdateDraft}
      />

      <FeatureFlagSection
        featureKeys={props.featureKeys}
        draft={props.draft}
        setFeature={props.setFeature}
        label={props.label}
      />
    </div>
  );
}
