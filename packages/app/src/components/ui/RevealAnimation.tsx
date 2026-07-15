import { For, Show, createEffect, createSignal, onCleanup } from "solid-js";
import type { RevealAnimationMode } from "@cs-inv-edit/contracts";
import { rarityBorderClass } from "../inventory-view-utils.js";

export interface RevealItem {
  name: string;
  imageUrl?: string;
  rarity?: string;
}

export interface RevealAnimationProps {
  open: boolean;
  mode: RevealAnimationMode;
  title: string;
  candidates: RevealItem[];
  result: RevealItem;
  onComplete: () => void;
}

function randomCandidate(items: RevealItem[], fallback: RevealItem) {
  if (items.length === 0) return fallback;
  return items[Math.floor(Math.random() * items.length)] ?? fallback;
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

    if (props.mode === "countdown") {
      timers.push(window.setInterval(() => setCount((value) => Math.max(0, value - 1)), 1000));
      timers.push(window.setTimeout(() => setRevealed(true), 3000));
      timers.push(window.setTimeout(props.onComplete, 4300));
    } else if (props.mode === "slot-machine") {
      const leadItems = 28 + Math.floor(Math.random() * 18);
      const tailItems = 4;
      const nextReel = Array.from({ length: leadItems + tailItems + 1 }, () => randomCandidate(props.candidates, props.result));
      nextReel[leadItems] = props.result;
      const duration = 4300 + Math.floor(Math.random() * 2600);
      setReel(nextReel);
      setTravel({ duration, offset: leadItems * 188 + 88 });
      timers.push(window.setTimeout(() => setRolling(true), 60 + Math.floor(Math.random() * 180)));
      timers.push(window.setTimeout(() => setRevealed(true), duration + 250));
      timers.push(window.setTimeout(props.onComplete, duration + 1550));
    }

    onCleanup(() => timers.forEach((timer) => window.clearTimeout(timer)));
  });

  return (
    <Show when={props.open && props.mode !== "none"}>
      <div class="reveal-overlay" role="dialog" aria-modal="true" aria-label={props.title}>
        <div class="reveal-panel">
          <p class="reveal-eyebrow">{props.title}</p>
          <Show when={props.mode === "countdown"}>
            <div class="reveal-countdown">
              <Show when={!revealed()} fallback={<ResultCard item={props.result} />}>
                <span>{count()}</span>
              </Show>
            </div>
          </Show>
          <Show when={props.mode === "slot-machine"}>
            <div class="reveal-window">
              <div class="reveal-marker" />
              <div
                class="reveal-reel"
                classList={{ "is-rolling": rolling() }}
                style={{
                  "--reveal-duration": `${travel().duration}ms`,
                  "--reveal-offset": `${travel().offset}px`,
                }}
              >
                <For each={reel()}>{(item) => <ResultCard item={item} compact />}</For>
              </div>
            </div>
            <Show when={revealed()}><p class="reveal-result-name">{props.result.name}</p></Show>
          </Show>
        </div>
      </div>
    </Show>
  );
}

function ResultCard(props: { item: RevealItem; compact?: boolean }) {
  const [imageFailed, setImageFailed] = createSignal(false);
  return (
    <div class={`reveal-item rarity-outline ${rarityBorderClass(props.item.rarity)} ${props.compact ? "is-compact" : ""}`}>
      <Show when={props.item.imageUrl && !imageFailed()} fallback={<div class="reveal-item-placeholder">?</div>}>
        <img src={props.item.imageUrl} alt="" referrerpolicy="no-referrer" onError={() => setImageFailed(true)} />
      </Show>
      <p>{props.item.name}</p>
    </div>
  );
}
