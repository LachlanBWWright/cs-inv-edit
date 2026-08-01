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
      ? "rounded-2xl border border-slate-800 bg-slate-900 shadow-sm shadow-black"
      : "rounded-xl border border-slate-800 bg-slate-950";
  return (
    <Dynamic
      component={props.as ?? "div"}
      class={`${toneClass} ${props.class ?? ""}`}
    >
      {props.children}
    </Dynamic>
  );
}
