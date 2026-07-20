import { For, Show, createEffect, createSignal, onCleanup } from "solid-js";
import { Portal } from "solid-js/web";
import type { RevealAnimationMode } from "@cs-inv-edit/contracts";
import { rarityBorderClass } from "../inventory-view-utils.js";
import { generateCappedWear, weightedRandomItem } from "../related-item-preview-utils.js";
import { WearRangeBar } from "./WearRangeBar.js";

export interface RevealItem {
  name: string;
  imageUrl?: string;
  rarity?: string;
  kind?: string;
  wear?: number;
  wearMin?: number;
  wearMax?: number;
  isStatTrak?: boolean;
  supportsStatTrak?: boolean;
}

export interface RevealAnimationProps {
  open: boolean;
  mode: RevealAnimationMode;
  immediate?: boolean;
  title: string;
  candidates: RevealItem[];
  result: RevealItem;
  onComplete: () => void;
}

export function randomRevealCandidate(items: RevealItem[], fallback: RevealItem, random = Math.random) {
  return weightedRandomItem(items, random) ?? fallback;
}

export function generateRevealMiss(item: RevealItem, random = Math.random): RevealItem {
  const isSkin = item.kind === "weapon_skin" || item.wearMin !== undefined || item.wearMax !== undefined;
  return {
    ...item,
    isStatTrak: isSkin && item.supportsStatTrak === true && random() < 0.1,
    wear: isSkin ? item.wear ?? generateCappedWear(item.wearMin, item.wearMax, random) : undefined,
  };
}

function ModeContent(props: RevealAnimationProps & { count: number; revealed: boolean; rolling: boolean; reel: RevealItem[]; travel: { duration: number; offset: number } }) {
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

  if (props.mode === "slot-machine") {
    return (
      <>
        <div class="reveal-window">
          <div class="reveal-marker" />
          <div
        class="reveal-reel"
        classList={{ "is-rolling": props.rolling }}
        style={{
        "--reveal-duration": `${props.travel.duration}ms`,
        "--reveal-offset": `${props.travel.offset}px`,
        }}
          >
            <For each={props.reel}>{(item) => <ResultCard item={item} compact />}</For>
          </div>
        </div>
        <Show when={props.revealed}><p class="reveal-result-name">{props.result.name}</p></Show>
      </>
    );
  }

  return null;
}

export function RevealAnimation(props: RevealAnimationProps) {
  const [count, setCount] = createSignal(3);
  const [revealed, setRevealed] = createSignal(false);
  const [rolling, setRolling] = createSignal(false);
  const [reel, setReel] = createSignal<RevealItem[]>([]);
  const [travel, setTravel] = createSignal({ duration: 5000, offset: 88 });

  createEffect(() => {
    if (!props.open) return;
    setCount(3);
    setRevealed(false);
    setRolling(false);
    const timers: number[] = [];

    if (props.immediate) {
      setRevealed(true);
      timers.push(window.setTimeout(props.onComplete, 2200));
    } else if (props.mode === "countdown") {
      timers.push(window.setInterval(() => setCount((value) => Math.max(0, value - 1)), 1000));
      timers.push(window.setTimeout(() => setRevealed(true), 3000));
      timers.push(window.setTimeout(props.onComplete, 4300));
    } else if (props.mode === "slot-machine") {
      const leadItems = 22 + Math.floor(Math.random() * 30);
      const tailItems = 4;
      const nextReel = Array.from({ length: leadItems + tailItems + 1 }, () => generateRevealMiss(randomRevealCandidate(props.candidates, props.result)));
      nextReel[leadItems] = props.result;
      const landingDirection = Math.random() < 0.5 ? -1 : 1;
      const landingJitter = landingDirection * Math.sqrt(Math.random()) * 88;
      const duration = 3900 + leadItems * 55 + Math.floor(Math.random() * 1200);
      setReel(nextReel);
      setTravel({ duration, offset: leadItems * 188 + 88 + landingJitter });
      timers.push(window.setTimeout(() => setRolling(true), 60 + Math.floor(Math.random() * 180)));
      timers.push(window.setTimeout(() => setRevealed(true), duration + 250));
      timers.push(window.setTimeout(props.onComplete, duration + 1550));
    }

    onCleanup(() => timers.forEach((timer) => window.clearTimeout(timer)));
  });

  return (
    <Portal>
      <Show when={props.open && (props.mode !== "none" || props.immediate)}>
        <div class="reveal-overlay" role="dialog" aria-modal="true" aria-label={props.title}>
          <div class="reveal-panel">
            <p class="reveal-eyebrow">{props.title}</p>
            <ModeContent count={count()} revealed={revealed()} rolling={rolling()} reel={reel()} travel={travel()} {...props} />
          </div>
        </div>
      </Show>
    </Portal>
  );
}

function ResultCard(props: { item: RevealItem; compact?: boolean }) {
  const [imageFailed, setImageFailed] = createSignal(false);
  return (
    <div class={`reveal-item rarity-outline relative ${rarityBorderClass(props.item.rarity)} ${props.compact ? "is-compact" : ""}`}>
      <Show when={props.item.isStatTrak}><span class="absolute right-2 top-2 rounded bg-orange-500/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-orange-300">StatTrak™</span></Show>
      <Show when={props.item.imageUrl && !imageFailed()} fallback={<div class="reveal-item-placeholder">?</div>}>
        <img src={props.item.imageUrl} alt="" referrerpolicy="no-referrer" onError={() => setImageFailed(true)} />
      </Show>
      <p>{props.item.name}</p>
      <Show when={props.item.wear !== undefined}><WearRangeBar compact wear={props.item.wear!} min={props.item.wearMin} max={props.item.wearMax} /></Show>
    </div>
  );
}
