export interface SwitchProps {
  checked: boolean;
  disabled?: boolean;
  "aria-label"?: string;
  onCheckedChange: (checked: boolean) => void;
}

/** A small shadcn-style switch primitive for boolean settings. */
export function Switch(props: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={props.checked}
      aria-label={props["aria-label"]}
      disabled={props.disabled}
      class="peer inline-flex h-6 w-11 shrink-0 items-center rounded-full border-2 border-transparent bg-slate-700 p-0.5 shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-amber-400"
      data-state={props.checked ? "checked" : "unchecked"}
      onClick={() => props.onCheckedChange(!props.checked)}
    >
      <span
        aria-hidden="true"
        class="pointer-events-none block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-5"
        data-state={props.checked ? "checked" : "unchecked"}
      />
    </button>
  );
}
