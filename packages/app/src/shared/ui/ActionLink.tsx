import type { JSX } from "solid-js";

export interface ActionLinkProps {
  children: JSX.Element;
  href: string;
  class?: string;
  tone?: "neutral" | "primary" | "commerce";
}

export function ActionLink(props: ActionLinkProps) {
  const tones = {
    neutral:
      "border-slate-700 bg-slate-900 text-slate-200 hover:border-slate-600 hover:bg-slate-800",
    primary:
      "border-cyan-700 bg-cyan-950 text-cyan-100 hover:bg-cyan-900",
    commerce:
      "border-emerald-700 bg-emerald-950 text-emerald-100 hover:bg-emerald-900",
  };
  return (
    <a
      class={`block w-full rounded-xl border px-4 py-3 text-center text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-cyan-400/60 ${tones[props.tone ?? "neutral"]} ${props.class ?? ""}`}
      href={props.href}
      target="_blank"
      rel="noopener noreferrer"
    >
      {props.children}
    </a>
  );
}
