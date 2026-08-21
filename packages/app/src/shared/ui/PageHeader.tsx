import type { JSX } from "solid-js";

export interface PageHeaderProps {
  title: string;
  description?: string;
  eyebrow?: string;
  actions?: JSX.Element;
  class?: string;
}

export function PageHeader(props: PageHeaderProps) {
  return (
    <header
      class={`flex flex-wrap items-start justify-between gap-4 ${props.class ?? ""}`}
    >
      <div class="min-w-0">
        {props.eyebrow ? (
          <p class="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-cyan-300">
            {props.eyebrow}
          </p>
        ) : null}
        <h2 class="text-2xl font-semibold tracking-tight text-slate-100 sm:text-3xl">
          {props.title}
        </h2>
        {props.description ? (
          <p class="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
            {props.description}
          </p>
        ) : null}
      </div>
      {props.actions ? (
        <div class="flex shrink-0 flex-wrap items-center gap-2">
          {props.actions}
        </div>
      ) : null}
    </header>
  );
}
