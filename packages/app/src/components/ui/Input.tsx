export interface InputProps {
  value?: string;
  class?: string;
  placeholder?: string;
  type?: string;
  required?: boolean;
  disabled?: boolean;
  autocomplete?: string;
  onInput?: (event: InputEvent) => void;
}

function cn(...values: Array<string | false | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function Input(props: InputProps) {
  return (
    <input
      value={props.value}
      type={props.type ?? "text"}
      placeholder={props.placeholder}
      required={props.required}
      disabled={props.disabled}
      autocomplete={props.autocomplete}
      class={cn("w-full rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/30", props.class)}
      onInput={props.onInput}
    />
  );
}
