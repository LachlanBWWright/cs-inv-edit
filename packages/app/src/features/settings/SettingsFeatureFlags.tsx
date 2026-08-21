import { For } from "solid-js";
import type { FeatureFlags, SettingsData } from "@cs-inv-edit/contracts";

function FeatureFlagRow(props: {
  flag: keyof FeatureFlags;
  draft: SettingsData | undefined;
  label: string;
  setFeature: (key: keyof FeatureFlags, enabled: boolean) => void;
}) {
  const update = (event: Event & { currentTarget: HTMLInputElement }) =>
    props.setFeature(props.flag, event.currentTarget.checked);
  return (
    <label class="flex items-center justify-between gap-3 py-2.5">
      <span class="text-slate-200">{props.label}</span>
      <input
        type="checkbox"
        checked={props.draft?.featureFlags[props.flag] ?? false}
        onChange={update}
      />
    </label>
  );
}

export function SettingsFeatureFlags(props: {
  keys: Array<keyof FeatureFlags>;
  draft: SettingsData | undefined;
  setFeature: (key: keyof FeatureFlags, enabled: boolean) => void;
  label: (key: keyof FeatureFlags) => string;
}) {
  return (
    <section class="border-b border-slate-800 pb-5 last:border-b-0 last:pb-0">
      <h4 class="text-sm font-semibold text-slate-100">Feature flags</h4>
      <div class="mt-3 divide-y divide-slate-800 text-sm text-slate-400">
        <For each={props.keys}>
          {(key) => (
            <FeatureFlagRow
              flag={key}
              draft={props.draft}
              label={props.label(key)}
              setFeature={props.setFeature}
            />
          )}
        </For>
      </div>
    </section>
  );
}
