import type { JSX } from "solid-js";
import { Dynamic } from "solid-js/web";

export interface SurfaceProps {
  children?: JSX.Element;
  class?: string;
  as?: "div" | "section" | "article";
  tone?: "panel" | "inset";
}

export function Surface(props: SurfaceProps) {
  const tone = props.tone ?? "panel";
  const toneClass =
    tone === "panel"
      ? "rounded-2xl border border-slate-800 bg-slate-900/80 shadow-[0_10px_60px_-30px_rgba(34,211,238,0.35)]"
      : "rounded-xl border border-slate-800 bg-slate-950/60";
  return (
    <Dynamic
      component={props.as ?? "div"}
      class={`${toneClass} ${props.class ?? ""}`}
    >
      {props.children}
    </Dynamic>
  );
}
