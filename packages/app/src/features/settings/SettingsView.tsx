import {
  createEffect,
  createMemo,
  createSignal,
  For,
  onCleanup,
  Show,
} from "solid-js";
import type {
  FeatureFlags,
  RevealAnimationMode,
  SettingsData,
  TradeUpAnimationMode,
} from "@cs-inv-edit/contracts";
import { Input } from "../../shared/ui/Input.js";
import { Alert } from "../../shared/ui/Alert.js";
import { Button } from "../../shared/ui/Button.js";
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
  settingsEqual,
  type SettingsViewProps,
} from "./settings-view-model.js";
import { RevealSettingsSection } from "./settings-reveal-section.js";
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
  const [statusVariant, setStatusVariant] = createSignal<
    import("../../shared/ui-types.js").FeedbackTone
  >("default");
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

  const featureKeys = createMemo(
    () =>
      Object.keys(
        props.settings?.featureFlags ?? draft()?.featureFlags ?? {},
      ) as Array<keyof FeatureFlags>,
  );
  const hasChanges = createMemo(() => !settingsEqual(draft(), savedSettings()));
  const featureLabel = (key: keyof FeatureFlags) => {
    const words = key.replace(/([A-Z])/g, " $1").replace(/^enable /, "");
    return words.charAt(0).toUpperCase() + words.slice(1).toLowerCase();
  };
  const debugCollections = () => {
    if (props.inventory?.collections?.length) {
      return props.inventory.collections.map(
        (collection) =>
          [
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
          ] as [string, RevealItem[]],
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

  const setFeature = (key: keyof FeatureFlags, value: boolean) => {
    setDraft((current) =>
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
    setDraft((current) =>
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
            disabled={!hasChanges() || saving()}
            class="rounded-full"
            onClick={() => void save()}
          >
            {saving() ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>

      <Show when={status()}>
        <Alert class="mt-3" variant={statusVariant()}>
          {status()}
        </Alert>
      </Show>

      <div class="mt-4 space-y-4">
        <RevealSettingsSection
          animationMode={animationMode}
          setAnimationMode={setAnimationMode}
          selectedDebugCollection={selectedDebugCollection}
          debugCollections={debugCollections}
          setDebugCollection={setDebugCollection}
          selectedDebugCandidates={selectedDebugCandidates}
          playDebugAnimation={playDebugAnimation}
        />
        <section class="rounded-2xl border border-slate-800/70 bg-slate-900 p-3">
          <h4 class="text-sm font-semibold text-slate-100">
            Armory purchase pacing
          </h4>
          <p class="mt-1 text-xs text-slate-500">
            Delay between protobuf purchase messages during a bulk buy.
          </p>
          <label class="mt-3 flex items-center gap-3 text-sm">
            <Input
              type="number"
              min="1"
              max="60"
              class="w-24"
              value={String(draft()?.armoryPurchasePacingSeconds ?? 5)}
              onInput={(event) =>
                setDraft((current) =>
                  current
                    ? {
                        ...current,
                        armoryPurchasePacingSeconds: Math.min(
                          60,
                          Math.max(
                            1,
                            Number(
                              (event.currentTarget as HTMLInputElement).value,
                            ) || 5,
                          ),
                        ),
                      }
                    : current,
                )
              }
            />
            <span class="text-slate-400">seconds</span>
          </label>
        </section>

        <section class="rounded-2xl border border-slate-800/70 bg-slate-900 p-3">
          <h4 class="text-sm font-semibold text-slate-100">Backend</h4>
          <div class="mt-3 space-y-3 text-sm text-slate-400">
            <label class="flex flex-col gap-2">
              <span class="text-slate-200">Local backend URL</span>
              <Input
                value={draft()?.backendUrl ?? ""}
                onInput={(event) =>
                  setDraft((current) =>
                    current
                      ? {
                          ...current,
                          backendUrl:
                            (event.currentTarget as HTMLInputElement | null)
                              ?.value ?? "",
                        }
                      : current,
                  )
                }
              />
            </label>
            <label class="flex items-center justify-between gap-3">
              <span class="text-slate-200">Validation mode</span>
              <input
                type="checkbox"
                checked={draft()?.validationMode ?? false}
                onChange={(event) =>
                  setDraft((current) =>
                    current
                      ? {
                          ...current,
                          validationMode:
                            (event.currentTarget as HTMLInputElement | null)
                              ?.checked ?? false,
                        }
                      : current,
                  )
                }
              />
            </label>
            <label class="flex items-center justify-between gap-3">
              <span class="text-slate-200">Sacrificial account mode</span>
              <input
                type="checkbox"
                checked={draft()?.sacrificialAccountMode ?? false}
                onChange={(event) =>
                  setDraft((current) =>
                    current
                      ? {
                          ...current,
                          sacrificialAccountMode:
                            (event.currentTarget as HTMLInputElement | null)
                              ?.checked ?? false,
                        }
                      : current,
                  )
                }
              />
            </label>
          </div>
        </section>

        <section class="rounded-2xl border border-slate-800/70 bg-slate-900 p-3">
          <h4 class="text-sm font-semibold text-slate-100">Feature flags</h4>
          <div class="mt-3 space-y-2 text-sm text-slate-400">
            <For each={featureKeys()}>
              {(key) => (
                <label class="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2">
                  <span class="text-slate-200">{featureLabel(key)}</span>
                  <input
                    type="checkbox"
                    checked={draft()?.featureFlags[key] ?? false}
                    onChange={(event) =>
                      setFeature(
                        key,
                        (event.currentTarget as HTMLInputElement | null)
                          ?.checked ?? false,
                      )
                    }
                  />
                </label>
              )}
            </For>
          </div>
        </section>
      </div>
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
