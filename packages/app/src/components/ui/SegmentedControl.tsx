import { For, type JSX } from "solid-js";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  suffix?: JSX.Element;
}

export interface SegmentedControlProps<T extends string> {
  value: T;
  options: readonly SegmentedOption<T>[];
  onChange: (value: T) => void;
  label: string;
  class?: string;
}

export function SegmentedControl<T extends string>(
  props: SegmentedControlProps<T>,
) {
  return (
    <div
      class={`flex gap-1 overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/60 p-1 ${props.class ?? ""}`}
      role="tablist"
      aria-label={props.label}
    >
      <For each={props.options}>
        {(option) => (
          <button
            type="button"
            class={`flex min-w-fit flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-cyan-400/60 ${
              props.value === option.value
                ? "bg-slate-800 text-white shadow"
                : "text-slate-400 hover:bg-slate-900/60 hover:text-slate-200"
            }`}
            role="tab"
            aria-selected={props.value === option.value}
            onClick={() => props.onChange(option.value)}
          >
            {option.label}
            {option.suffix}
          </button>
        )}
      </For>
    </div>
  );
}
