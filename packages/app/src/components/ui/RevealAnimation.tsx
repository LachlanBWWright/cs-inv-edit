import { For, Show, createEffect, createMemo, createSignal, on, onCleanup } from "solid-js";
import { Portal } from "solid-js/web";
import type { RevealAnimationMode } from "@cs-inv-edit/contracts";
import { ResultAsync, fromThrowable } from "neverthrow";
import { rarityBorderClass } from "../inventory-view-utils.js";
import { generateCappedWear, weightedRandomItem } from "../related-item-preview-utils.js";
import { WearRangeBar } from "./WearRangeBar.js";
import type { ReturnEstimate } from "../roi-utils.js";
import { ReturnEstimateCard } from "../ReturnEstimateCard.js";

const crateOpenSoundUrl = new URL("../../assets/audio/csgo-ui-crate-open.wav", import.meta.url).href;
const crateScrollSoundUrl = new URL("../../assets/audio/csgo-ui-crate-item-scroll.wav", import.meta.url).href;

export interface RevealItem {
  name: string;
  marketName?: string;
  price?: string;
  imageUrl?: string;
  rarity?: string;
  kind?: string;
  wear?: number;
  wearMin?: number;
  wearMax?: number;
  isStatTrak?: boolean;
  isSouvenir?: boolean;
  supportsStatTrak?: boolean;
  supportsSouvenir?: boolean;
}

export interface RevealAnimationProps {
  open: boolean;
  mode: RevealAnimationMode;
  immediate?: boolean;
  title: string;
  candidates: RevealItem[];
  result: RevealItem;
  ready?: boolean;
  onComplete: () => void;
  returnEstimate?: ReturnEstimate;
  returnEstimateLoading?: boolean;
  returnEstimateCostLabel?: string;
  returnEstimateUnitCost?: number;
  returnEstimateNote?: string;
}

export const STATTRAK_ODDS = 1 / 10;
export const MOCK_RESULT_DELAY_MS = 3000;

export function randomRevealCandidate(items: RevealItem[], fallback: RevealItem, random = Math.random) {
  return weightedRandomItem(items, random) ?? fallback;
}

export function generateRevealMiss(item: RevealItem, random = Math.random): RevealItem {
  const isSkin = item.kind === "weapon_skin" || item.wearMin !== undefined || item.wearMax !== undefined;
  const isSouvenir = isSkin && item.supportsSouvenir === true;
  return {
    ...item,
    isStatTrak: !isSouvenir && isSkin && item.supportsStatTrak === true && random() < STATTRAK_ODDS,
    isSouvenir,
    wear: isSkin ? item.wear ?? generateCappedWear(item.wearMin, item.wearMax, random) : undefined,
  };
}

const audioPools = new Map<string, { next: number; players: HTMLAudioElement[] }>();
const reelItemStridePx = 177;
const reelItemCenterPx = 88;
export const LANDING_EDGE_BIAS_EXPONENT = 1 / 3;
const waitingLoopStartOffsetPx = 24 * reelItemStridePx + reelItemCenterPx;
const initialSpinPixelsPerMs = 2.15;
const floorSpinPixelsPerMs = 0.62;
const spinDecayMs = 2400;
const targetRevealDurationMs = 10000;
const minimumLandingDurationMs = 3500;
const linearDecelerationDistanceRatio = 1 / 2;

function waitingVelocity(elapsedMs: number) {
  return floorSpinPixelsPerMs + (initialSpinPixelsPerMs - floorSpinPixelsPerMs) * Math.exp(-elapsedMs / spinDecayMs);
}

export function generateLandingJitter(random = Math.random) {
  const direction = random() < 0.5 ? -1 : 1;
  return direction * Math.pow(random(), LANDING_EDGE_BIAS_EXPONENT) * reelItemCenterPx;
}
const createAudioPool = fromThrowable((url: string) => ({
  next: 0,
  players: Array.from({ length: 4 }, () => {
    const audio = new window.Audio(url);
    audio.preload = "auto";
    audio.volume = 0.55;
    return audio;
  }),
}), () => undefined);
const restartAudio = fromThrowable((audio: HTMLAudioElement) => {
  audio.currentTime = 0;
  return audio.play();
}, () => undefined);

function playSound(url: string) {
  const existingPool = audioPools.get(url);
  const pool = existingPool ?? createAudioPool(url).unwrapOr(undefined);
  if (!pool) return;
  if (!existingPool) audioPools.set(url, pool);
  const audio = pool.players[pool.next];
  pool.next = (pool.next + 1) % pool.players.length;
  if (!audio) return;
  restartAudio(audio).match(
    (playing) => {
      void ResultAsync.fromPromise(playing, () => undefined).match(
        () => undefined,
        () => undefined,
      );
    },
    () => undefined,
  );
}

function transformTranslateX(transform: string): number | undefined {
  const values = transform.match(/^matrix(?:3d)?\((.+)\)$/)?.[1]?.split(",").map((value) => Number.parseFloat(value.trim()));
  if (!values?.every(Number.isFinite)) return undefined;
  if (values.length === 6) return values[4];
  if (values.length === 16) return values[12];
  return undefined;
}

const readRenderedReelOffset = fromThrowable((element: HTMLDivElement | undefined) => {
  if (!element) return waitingLoopStartOffsetPx;
  const translateX = transformTranslateX(window.getComputedStyle(element).transform);
  return translateX === undefined ? waitingLoopStartOffsetPx : Math.abs(translateX);
}, () => waitingLoopStartOffsetPx);

function ModeContent(props: RevealAnimationProps & { count: number; revealed: boolean; rolling: boolean; waiting: boolean; reel: RevealItem[]; reelRef: (element: HTMLDivElement) => void; travel: { duration: number; offset: number; startOffset: number } }) {
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
      <div class="mx-auto w-[530px] max-w-full overflow-hidden rounded-2xl border border-slate-700 bg-slate-950/90 shadow-2xl">
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

  return null;
}

export function RevealAnimation(props: RevealAnimationProps) {
  const isOpen = createMemo(() => props.open);
  const [count, setCount] = createSignal(3);
  const [revealed, setRevealed] = createSignal(false);
  const [rolling, setRolling] = createSignal(false);
  const [waiting, setWaiting] = createSignal(false);
  const [started, setStarted] = createSignal(false);
  const [reel, setReel] = createSignal<RevealItem[]>([]);
  const [travel, setTravel] = createSignal({ duration: 5000, offset: 88, startOffset: 88 });
  let reelElement: HTMLDivElement | undefined;
  let waitingStartedAt = 0;
  let currentWaitingVelocity = initialSpinPixelsPerMs;
  let landingPlan: { distance: number; duration: number; offset: number; startedAt: number; startOffset: number } | undefined;

  createEffect(on(isOpen, (open) => {
    if (!open) return;
    setCount(3);
    setRevealed(false);
    setRolling(false);
    setWaiting(false);
    setStarted(false);
    landingPlan = undefined;
    const timers: number[] = [];

    if (props.immediate) {
      setRevealed(true);
      timers.push(window.setTimeout(props.onComplete, 2200));
    } else if (props.mode === "countdown") {
      timers.push(window.setInterval(() => setCount((value) => Math.max(0, value - 1)), 1000));
    } else if (props.mode === "slot-machine") {
      const fallback = props.candidates[0] ?? props.result;
      const loop = Array.from({ length: 24 }, () => generateRevealMiss(randomRevealCandidate(props.candidates, fallback)));
      setReel([...loop, ...loop, ...loop, ...loop]);
      timers.push(window.setTimeout(() => {
        playSound(crateOpenSoundUrl);
        waitingStartedAt = window.performance.now();
        currentWaitingVelocity = initialSpinPixelsPerMs;
        setWaiting(true);
        setStarted(true);
      }, 60 + Math.floor(Math.random() * 180)));
    }

    onCleanup(() => timers.forEach((timer) => window.clearTimeout(timer)));
  }));

  createEffect(on([
    isOpen,
    () => props.ready ?? true,
    () => started(),
    () => count(),
  ], () => {
    if (!isOpen() || props.immediate || (props.ready ?? true) !== true) return;
    if (props.mode === "countdown" && count() === 0 && !revealed()) {
      setRevealed(true);
      const timer = window.setTimeout(props.onComplete, 1300);
      onCleanup(() => window.clearTimeout(timer));
    }
    if (props.mode !== "slot-machine" || !started() || !waiting()) return;
    const elapsed = Math.max(0, window.performance.now() - waitingStartedAt);
    const targetLandingDuration = Math.max(minimumLandingDurationMs, targetRevealDurationMs - elapsed);
    const desiredTravel = currentWaitingVelocity * targetLandingDuration * linearDecelerationDistanceRatio;
    const leadItems = Math.max(8, Math.round(desiredTravel / reelItemStridePx));
    const tailItems = 4;
    const startOffset = readRenderedReelOffset(reelElement).unwrapOr(waitingLoopStartOffsetPx);
    const visibleIndex = Math.max(0, Math.round((startOffset - reelItemCenterPx) / reelItemStridePx));
    const landingIndex = visibleIndex + leadItems;
    const nextReel = [...reel()];
    while (nextReel.length <= landingIndex + tailItems) {
      nextReel.push(generateRevealMiss(randomRevealCandidate(props.candidates, props.result)));
    }
    nextReel[landingIndex] = props.result;
    const landingJitter = generateLandingJitter();
    const offset = landingIndex * reelItemStridePx + reelItemCenterPx + landingJitter;
    const landingDistance = offset - startOffset;
    const duration = Math.round(landingDistance / (currentWaitingVelocity * linearDecelerationDistanceRatio));
    setWaiting(false);
    setRolling(false);
    setReel(nextReel);
    setTravel({ duration, offset, startOffset });
    setRolling(true);
    landingPlan = { distance: landingDistance, duration, offset, startedAt: window.performance.now(), startOffset };
    const revealTimer = window.setTimeout(() => setRevealed(true), duration + 250);
    const completeTimer = window.setTimeout(props.onComplete, duration + 1550);
    onCleanup(() => {
      reelElement?.style.removeProperty("transform");
      window.clearTimeout(revealTimer);
      window.clearTimeout(completeTimer);
    });
  }));

  createEffect(on([
    isOpen,
    () => started(),
  ], () => {
    if (!isOpen() || props.mode !== "slot-machine" || !started()) return;
    let frame: number | undefined;
    const loopDistance = 24 * reelItemStridePx;
    let waitingTravelled = 0;
    let totalTravelled = 0;
    let crossedItems = 0;
    let previousTime = window.performance.now();
    const animateReel = (time: number) => {
      const plan = landingPlan;
      if (plan) {
        const progress = Math.min(1, Math.max(0, (time - plan.startedAt) / plan.duration));
        const easedProgress = 2 * progress - progress * progress;
        const landingTravelled = plan.distance * easedProgress;
        const previousLandingTravelled = Math.max(0, totalTravelled - waitingTravelled);
        totalTravelled += Math.max(0, landingTravelled - previousLandingTravelled);
        if (reelElement) reelElement.style.transform = `translateX(-${plan.startOffset + landingTravelled}px)`;
        if (progress >= 1) {
          if (reelElement) reelElement.style.transform = `translateX(-${plan.offset}px)`;
          return;
        }
      } else {
        const elapsed = Math.max(0, time - waitingStartedAt);
        const delta = Math.min(50, Math.max(0, time - previousTime));
        currentWaitingVelocity = waitingVelocity(elapsed);
        const frameTravel = currentWaitingVelocity * delta;
        waitingTravelled += frameTravel;
        totalTravelled += frameTravel;
        if (reelElement) reelElement.style.transform = `translateX(-${waitingLoopStartOffsetPx + waitingTravelled % loopDistance}px)`;
      }
      previousTime = time;
      const nextCrossedItems = Math.floor(totalTravelled / reelItemStridePx);
      while (crossedItems < nextCrossedItems) {
        playSound(crateScrollSoundUrl);
        crossedItems += 1;
      }
      frame = window.requestAnimationFrame(animateReel);
    };
    frame = window.requestAnimationFrame(animateReel);
    onCleanup(() => {
      if (frame !== undefined) window.cancelAnimationFrame(frame);
    });
  }));

  return (
    <Portal>
      <Show when={props.open && (props.mode !== "none" || props.immediate)}>
        <div class="reveal-overlay" role="dialog" aria-modal="true" aria-label={props.title}>
          <div
            class="text-center"
            classList={{
              "reveal-panel": props.mode !== "slot-machine",
              "w-[530px] max-w-full": props.mode === "slot-machine",
            }}
          >
            <Show when={props.mode !== "slot-machine"}><p class="reveal-eyebrow">{props.title}</p></Show>
            <ModeContent count={count()} revealed={revealed()} rolling={rolling()} waiting={waiting()} reel={reel()} reelRef={(element) => { reelElement = element; }} travel={travel()} {...props} />
            <Show when={props.returnEstimate || props.returnEstimateLoading}><div class="mx-auto mt-3 w-[530px] max-w-full text-left"><ReturnEstimateCard estimate={props.returnEstimate} loading={props.returnEstimateLoading} costLabel={props.returnEstimateCostLabel} unitCost={props.returnEstimateUnitCost} note={props.returnEstimateNote} /></div></Show>
          </div>
        </div>
      </Show>
    </Portal>
  );
}

function ResultImageShowcase(props: { item: RevealItem }) {
  const [imageFailed, setImageFailed] = createSignal(false);
  return (
    <div class="relative mx-auto flex h-72 w-full flex-col items-center justify-center">
      <Show when={props.item.isStatTrak}><span class="absolute right-4 top-4 rounded bg-orange-500/20 px-2 py-1 text-xs font-bold uppercase tracking-wide text-orange-300">StatTrak™</span></Show>
      <Show when={props.item.isSouvenir}><span class="absolute right-4 top-4 rounded bg-amber-400/20 px-2 py-1 text-xs font-bold uppercase tracking-wide text-amber-200">Souvenir</span></Show>
      <Show when={props.item.imageUrl && !imageFailed()} fallback={<div class="text-6xl font-semibold text-slate-700">?</div>}>
        <img class="min-h-0 w-full flex-1 object-contain" src={props.item.imageUrl} alt={props.item.name} referrerpolicy="no-referrer" onError={() => setImageFailed(true)} />
      </Show>
      <p class="w-full truncate px-3 pb-3 text-sm font-semibold text-slate-100">{props.item.name}</p>
      <Show when={props.item.price}><p class="pb-3 text-sm font-semibold text-emerald-300">{props.item.price}</p></Show>
    </div>
  );
}

function ResultCard(props: { item: RevealItem; compact?: boolean }) {
  const [imageFailed, setImageFailed] = createSignal(false);
  return (
    <div class={`reveal-item rarity-outline relative ${rarityBorderClass(props.item.rarity)} ${props.compact ? "is-compact" : ""}`}>
      <Show when={props.item.isStatTrak}><span class="absolute right-2 top-2 rounded bg-orange-500/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-orange-300">StatTrak™</span></Show>
      <Show when={props.item.isSouvenir}><span class="absolute right-2 top-2 rounded bg-amber-400/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-200">Souvenir</span></Show>
      <Show when={props.item.imageUrl && !imageFailed()} fallback={<div class="reveal-item-placeholder">?</div>}>
        <img src={props.item.imageUrl} alt="" referrerpolicy="no-referrer" onError={() => setImageFailed(true)} />
      </Show>
      <p>{props.item.name}</p>
      <Show when={props.item.price}><p class="text-xs font-semibold text-emerald-300">{props.item.price}</p></Show>
      <Show when={props.item.wear !== undefined}><WearRangeBar compact wear={props.item.wear!} min={props.item.wearMin} max={props.item.wearMax} /></Show>
    </div>
  );
}
