import type { JSX } from "solid-js";

export interface CardProps {
  children?: JSX.Element;
  class?: string;
  onClick?: (event: MouseEvent) => void;
}

function cn(...values: Array<string | false | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function Card(props: CardProps) {
  return <div class={cn("rounded-2xl border border-slate-800 bg-slate-900/80 shadow-[0_10px_60px_-30px_rgba(34,211,238,0.35)]", props.class)} onClick={props.onClick}>{props.children}</div>;
}

export function CardHeader(props: CardProps) {
  return <div class={cn("border-b border-slate-800 px-5 py-4", props.class)}>{props.children}</div>;
}

export function CardContent(props: CardProps) {
  return <div class={cn("p-5", props.class)}>{props.children}</div>;
}
