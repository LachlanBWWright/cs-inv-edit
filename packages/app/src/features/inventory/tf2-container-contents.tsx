import { For, Show, type Accessor } from "solid-js";

interface TF2ContainerItem {
  name: string;
  imageUrl?: string;
  poolKind?: string;
  rarity?: string;
}

function ContainerListItem(props: { entry: TF2ContainerItem }) {
  return (
    <li class="grid grid-cols-[2rem_1fr_auto] items-center gap-2">
      <Show
        when={props.entry.imageUrl}
        fallback={<div class="grid h-8 w-8 place-items-center rounded bg-slate-900 text-slate-600">?</div>}
      >
        {(url) => (
          <img
            class="h-8 w-8 rounded bg-slate-900 object-contain"
            src={url()}
            alt=""
            loading="lazy"
            referrerpolicy="no-referrer"
          />
        )}
      </Show>
      <span>{props.entry.name}</span>
      <span>{props.entry.poolKind === "unresolved" ? "unresolved" : props.entry.rarity || "unknown rarity"}</span>
    </li>
  );
}

export function TF2ContainerContents(props: {
  items: Accessor<TF2ContainerItem[]>;
}) {
  return (
    <details class="rounded-xl border border-slate-800 p-3">
      <summary class="cursor-pointer text-sm font-medium text-slate-300">
        Possible schema contents ({props.items()?.length})
      </summary>
      <ul class="mt-2 max-h-52 space-y-1 overflow-y-auto text-xs text-slate-400">
        <For each={props.items()}>{(entry) => <ContainerListItem entry={entry} />}</For>
      </ul>
      <p class="mt-2 text-xs text-slate-500">
        Possible contents only. Exact odds and bonus-drop behavior are not inferred.
      </p>
    </details>
  );
}
