import {
  Show,
  createEffect,
  createMemo,
  createSignal,
  on,
  onCleanup,
} from "solid-js";
import { Portal } from "solid-js/web";
import type { RevealAnimationMode } from "@cs-inv-edit/contracts";
import { ResultAsync, fromThrowable } from "neverthrow";
import type { ReturnEstimate } from "../roi-utils.js";
import { ReturnEstimateCard } from "../ReturnEstimateCard.js";
import { ModeContent } from "./reveal-animation-content.js";
import { generateRevealMiss, randomRevealCandidate } from "./reveal-animation-random.js";
export {
  generateRevealMiss,
  MOCK_RESULT_DELAY_MS,
  randomRevealCandidate,
  STATTRAK_ODDS,
} from "./reveal-animation-random.js";

const crateOpenSoundUrl = new URL(
  "../../assets/audio/csgo-ui-crate-open.wav",
  import.meta.url,
).href;
const crateScrollSoundUrl = new URL(
  "../../assets/audio/csgo-ui-crate-item-scroll.wav",
  import.meta.url,
).href;

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

const audioPools = new Map<
  string,
  { next: number; players: HTMLAudioElement[] }
>();
const reelItemStridePx = 177;
const reelItemCenterPx = 88;
export const LANDING_EDGE_BIAS_EXPONENT = 1 / 3;
const waitingLoopStartOffsetPx = 24 * reelItemStridePx + reelItemCenterPx;
const initialSpinPixelsPerMs = 2.15;
const floorSpinPixelsPerMs = 0.62;
const spinDecayMs = 2400;
const minimumLandingDurationMs = 2400;
const landingDurationRangeMs = 1200;
const linearDecelerationDistanceRatio = 1 / 2;

function waitingVelocity(elapsedMs: number) {
  return (
    floorSpinPixelsPerMs +
    (initialSpinPixelsPerMs - floorSpinPixelsPerMs) *
      Math.exp(-elapsedMs / spinDecayMs)
  );
}

export function generateLandingDuration(random = Math.random) {
  return (
    minimumLandingDurationMs + Math.floor(random() * landingDurationRangeMs)
  );
}

export function landingProgress(progress: number) {
  const remaining = 1 - Math.min(1, Math.max(0, progress));
  return 1 - remaining * remaining * remaining;
}

export function generateLandingJitter(random = Math.random) {
  const direction = random() < 0.5 ? -1 : 1;
  return (
    direction *
    Math.pow(random(), LANDING_EDGE_BIAS_EXPONENT) *
    reelItemCenterPx
  );
}
const createAudioPool = fromThrowable(
  (url: string) => ({
    next: 0,
    players: Array.from({ length: 4 }, () => {
      const audio = new window.Audio(url);
      audio.preload = "auto";
      audio.volume = 0.55;
      return audio;
    }),
  }),
  () => undefined,
);
const restartAudio = fromThrowable(
  (audio: HTMLAudioElement) => {
    audio.currentTime = 0;
    return audio.play();
  },
  () => undefined,
);

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
  const values = transform
    .match(/^matrix(?:3d)?\((.+)\)$/)?.[1]
    ?.split(",")
    .map((value) => Number.parseFloat(value.trim()));
  if (!values?.every(Number.isFinite)) return undefined;
  if (values.length === 6) return values[4];
  if (values.length === 16) return values[12];
  return undefined;
}

const readRenderedReelOffset = fromThrowable(
  (element: HTMLDivElement | undefined) => {
    if (!element) return waitingLoopStartOffsetPx;
    const translateX = transformTranslateX(
      window.getComputedStyle(element).transform,
    );
    return translateX === undefined
      ? waitingLoopStartOffsetPx
      : Math.abs(translateX);
  },
  () => waitingLoopStartOffsetPx,
);


export function RevealAnimation(props: RevealAnimationProps) {
  const isOpen = createMemo(() => props.open);
  const [count, setCount] = createSignal(3);
  const [revealed, setRevealed] = createSignal(false);
  const [rolling, setRolling] = createSignal(false);
  const [waiting, setWaiting] = createSignal(false);
  const [started, setStarted] = createSignal(false);
  const [reel, setReel] = createSignal<RevealItem[]>([]);
  const [travel, setTravel] = createSignal({
    duration: 5000,
    offset: 88,
    startOffset: 88,
  });
  let reelElement: HTMLDivElement | undefined;
  let waitingStartedAt = 0;
  let currentWaitingVelocity = initialSpinPixelsPerMs;
  let landingPlan:
    | {
        distance: number;
        duration: number;
        offset: number;
        startedAt: number;
        startOffset: number;
      }
    | undefined;

  createEffect(
    on(isOpen, (open) => {
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
        timers.push(
          window.setInterval(
            () => setCount((value) => Math.max(0, value - 1)),
            1000,
          ),
        );
      } else if (props.mode === "slot-machine") {
        const fallback = props.candidates[0] ?? props.result;
        const loop = Array.from({ length: 24 }, () =>
          generateRevealMiss(randomRevealCandidate(props.candidates, fallback)),
        );
        setReel([...loop, ...loop, ...loop, ...loop]);
        timers.push(
          window.setTimeout(
            () => {
              playSound(crateOpenSoundUrl);
              waitingStartedAt = window.performance.now();
              currentWaitingVelocity = initialSpinPixelsPerMs;
              setWaiting(true);
              setStarted(true);
            },
            60 + Math.floor(Math.random() * 180),
          ),
        );
      }

      onCleanup(() => timers.forEach((timer) => window.clearTimeout(timer)));
    }),
  );

  createEffect(
    on(
      [isOpen, () => props.ready ?? true, () => started(), () => count()],
      () => {
        if (!isOpen() || props.immediate || (props.ready ?? true) !== true)
          return;
        if (props.mode === "countdown" && count() === 0 && !revealed()) {
          setRevealed(true);
          const timer = window.setTimeout(props.onComplete, 1300);
          onCleanup(() => window.clearTimeout(timer));
        }
        if (props.mode !== "slot-machine" || !started() || !waiting()) return;
        const targetLandingDuration = generateLandingDuration();
        const desiredTravel =
          currentWaitingVelocity *
          targetLandingDuration *
          linearDecelerationDistanceRatio;
        const leadItems = Math.max(
          8,
          Math.round(desiredTravel / reelItemStridePx),
        );
        const tailItems = 4;
        const startOffset = readRenderedReelOffset(reelElement).unwrapOr(
          waitingLoopStartOffsetPx,
        );
        const visibleIndex = Math.max(
          0,
          Math.round((startOffset - reelItemCenterPx) / reelItemStridePx),
        );
        const landingIndex = visibleIndex + leadItems;
        const nextReel = [...reel()];
        while (nextReel.length <= landingIndex + tailItems) {
          nextReel.push(
            generateRevealMiss(
              randomRevealCandidate(props.candidates, props.result),
            ),
          );
        }
        nextReel[landingIndex] = props.result;
        const landingJitter = generateLandingJitter();
        const offset =
          landingIndex * reelItemStridePx + reelItemCenterPx + landingJitter;
        const landingDistance = offset - startOffset;
        // Once the result is available, the waiting velocity floor no longer
        // controls the landing. Use a fresh randomized deceleration window and
        // let the landing easing decelerate all the way to zero.
        const duration = Math.round(targetLandingDuration);
        setWaiting(false);
        setRolling(false);
        setReel(nextReel);
        setTravel({ duration, offset, startOffset });
        setRolling(true);
        landingPlan = {
          distance: landingDistance,
          duration,
          offset,
          startedAt: window.performance.now(),
          startOffset,
        };
        const revealTimer = window.setTimeout(
          () => setRevealed(true),
          duration + 250,
        );
        const completeTimer = window.setTimeout(
          props.onComplete,
          duration + 1550,
        );
        onCleanup(() => {
          reelElement?.style.removeProperty("transform");
          window.clearTimeout(revealTimer);
          window.clearTimeout(completeTimer);
        });
      },
    ),
  );

  createEffect(
    on([isOpen, () => started()], () => {
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
          const progress = Math.min(
            1,
            Math.max(0, (time - plan.startedAt) / plan.duration),
          );
          const easedProgress = landingProgress(progress);
          const landingTravelled = plan.distance * easedProgress;
          const previousLandingTravelled = Math.max(
            0,
            totalTravelled - waitingTravelled,
          );
          totalTravelled += Math.max(
            0,
            landingTravelled - previousLandingTravelled,
          );
          if (reelElement)
            reelElement.style.transform = `translateX(-${plan.startOffset + landingTravelled}px)`;
          if (progress >= 1) {
            if (reelElement)
              reelElement.style.transform = `translateX(-${plan.offset}px)`;
            return;
          }
        } else {
          const elapsed = Math.max(0, time - waitingStartedAt);
          const delta = Math.min(50, Math.max(0, time - previousTime));
          currentWaitingVelocity = waitingVelocity(elapsed);
          const frameTravel = currentWaitingVelocity * delta;
          waitingTravelled += frameTravel;
          totalTravelled += frameTravel;
          if (reelElement)
            reelElement.style.transform = `translateX(-${waitingLoopStartOffsetPx + (waitingTravelled % loopDistance)}px)`;
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
    }),
  );

  return (
    <Portal>
      <Show when={props.open && (props.mode !== "none" || props.immediate)}>
        <div
          class="reveal-overlay"
          role="dialog"
          aria-modal="true"
          aria-label={props.title}
        >
          <div
            class="text-center"
            classList={{
              "reveal-panel": props.mode !== "slot-machine",
              "w-[530px] max-w-full": props.mode === "slot-machine",
            }}
          >
            <Show when={props.mode !== "slot-machine"}>
              <p class="reveal-eyebrow">{props.title}</p>
            </Show>
            <ModeContent
              count={count()}
              revealed={revealed()}
              rolling={rolling()}
              waiting={waiting()}
              reel={reel()}
              reelRef={(element) => {
                reelElement = element;
              }}
              travel={travel()}
              {...props}
            />
            <Show when={props.returnEstimate || props.returnEstimateLoading}>
              <div class="mx-auto mt-3 w-[530px] max-w-full text-left">
                <ReturnEstimateCard
                  estimate={props.returnEstimate}
                  loading={props.returnEstimateLoading}
                  costLabel={props.returnEstimateCostLabel}
                  unitCost={props.returnEstimateUnitCost}
                  note={props.returnEstimateNote}
                />
              </div>
            </Show>
          </div>
        </div>
      </Show>
    </Portal>
  );
}
