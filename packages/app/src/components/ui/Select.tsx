import type { JSX } from "solid-js";

export interface SelectProps {
  children?: JSX.Element;
  value?: string;
  class?: string;
  disabled?: boolean;
  onChange?: JSX.EventHandler<HTMLSelectElement, Event>;
  onInput?: JSX.EventHandler<HTMLSelectElement, InputEvent>;
}

function cn(...values: Array<string | false | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function Select(props: SelectProps) {
  return (
    <select
      disabled={props.disabled}
      class={cn(
        "rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/30 disabled:cursor-not-allowed disabled:opacity-50",
        props.class,
      )}
      value={props.value}
      onChange={(event) => props.onChange?.(event)}
      onInput={(event) => props.onInput?.(event)}
    >
      {props.children}
    </select>
  );
}
