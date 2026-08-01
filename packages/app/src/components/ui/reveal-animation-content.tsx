import { For, Show, createSignal } from "solid-js";
import { rarityBorderClass } from "../inventory-view-utils.js";
import { WearRangeBar } from "./WearRangeBar.js";
import { ModalCloseRow } from "./ModalBackdrop.js";
import type {
  RevealAnimationProps,
  RevealItem,
} from "./RevealAnimation.js";

export function ModeContent(
  props: RevealAnimationProps & {
    count: number;
    revealed: boolean;
    rolling: boolean;
    waiting: boolean;
    reel: RevealItem[];
    reelRef: (element: HTMLDivElement) => void;
    travel: { duration: number; offset: number; startOffset: number };
  },
) {
  if (props.immediate) {
    return <div class="reveal-countdown"><ResultCard item={props.result} /></div>;
  }
  if (props.mode === "countdown") {
    return (
      <div class="reveal-countdown">
        {props.revealed ? <ResultCard item={props.result} /> : <span>{props.count}</span>}
      </div>
    );
  }
  if (props.mode !== "slot-machine") return null;
  return (
    <div class="mx-auto w-[530px] max-w-full overflow-hidden rounded-2xl border border-slate-700 bg-slate-950/90 shadow-2xl">
      <div class="px-2 pt-2">
        <RevealCloseRow onClose={props.onComplete} />
      </div>
      <Show when={!props.revealed} fallback={<ResultImageShowcase item={props.result} />}>
        <div class="reveal-window w-full">
          <div class="reveal-marker" />
          <div
            ref={props.reelRef}
            class="reveal-reel gap-px"
            classList={{ "is-waiting": props.waiting }}
            style={{
              "--reveal-duration": `${props.travel.duration}ms`,
              "--reveal-offset": `${props.travel.offset}px`,
              "--reveal-start-offset": `${props.travel.startOffset}px`,
            }}
          >
            <For each={props.reel}>{(item) => <ResultCard item={item} compact />}</For>
          </div>
        </div>
      </Show>
    </div>
  );
}

function RevealCloseRow(props: { onClose: () => void }) {
  return (
    <ModalCloseRow
      label="Close animation"
      buttonClass="border-slate-600 bg-slate-950"
      onClose={props.onClose}
    />
  );
}

function ResultImageShowcase(props: { item: RevealItem }) {
  const [imageFailed, setImageFailed] = createSignal(false);
  return (
    <div class="relative mx-auto flex h-72 w-full flex-col items-center justify-center">
      <Show when={props.item.isStatTrak}>
        <span class="absolute right-4 top-4 rounded bg-orange-950 px-2 py-1 text-xs font-bold uppercase tracking-wide text-orange-300">StatTrak™</span>
      </Show>
      <Show when={props.item.isSouvenir}>
        <span class="absolute right-4 top-4 rounded bg-amber-950 px-2 py-1 text-xs font-bold uppercase tracking-wide text-amber-200">Souvenir</span>
      </Show>
      <Show
        when={props.item.imageUrl && !imageFailed()}
        fallback={<div class="text-6xl font-semibold text-slate-700">?</div>}
      >
        <img
          class="min-h-0 w-full flex-1 object-contain"
          src={props.item.imageUrl}
          alt={props.item.name}
          referrerpolicy="no-referrer"
          onError={() => setImageFailed(true)}
        />
      </Show>
      <p class="w-full truncate px-3 pb-3 text-sm font-semibold text-slate-100">{props.item.name}</p>
    </div>
  );
}

function ResultCard(props: { item: RevealItem; compact?: boolean }) {
  const [imageFailed, setImageFailed] = createSignal(false);
  return (
    <div class={`reveal-item rarity-outline relative ${rarityBorderClass(props.item.rarity)} ${props.compact ? "is-compact" : ""}`}>
      <Show when={props.item.isStatTrak}>
        <span class="absolute right-2 top-2 rounded bg-orange-950 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-orange-300">StatTrak™</span>
      </Show>
      <Show when={props.item.isSouvenir}>
        <span class="absolute right-2 top-2 rounded bg-amber-950 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-200">Souvenir</span>
      </Show>
      <Show when={props.item.imageUrl && !imageFailed()} fallback={<div class="reveal-item-placeholder">?</div>}>
        <img src={props.item.imageUrl} alt="" referrerpolicy="no-referrer" onError={() => setImageFailed(true)} />
      </Show>
      <p>{props.item.name}</p>
      <Show when={props.item.wear !== undefined}>
        <WearRangeBar compact wear={props.item.wear!} min={props.item.wearMin} max={props.item.wearMax} />
      </Show>
    </div>
  );
}
