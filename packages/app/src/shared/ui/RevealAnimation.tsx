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
import { ModalCloseRow } from "./ModalBackdrop.js";
import { useEscapeDismiss } from "./modal-dismiss.js";
import { transformTranslateX } from "./reveal-animation-layout.js";
import { ModeContent } from "./reveal-animation-content.js";
import {
  generateRevealMiss,
  randomRevealCandidate,
} from "./reveal-animation-random.js";
import {
  generateLandingDuration,
  generateLandingJitter,
  landingProgress,
  waitingVelocity,
} from "./reveal-animation-timing.js";
export {
  generateRevealMiss,
  MOCK_RESULT_DELAY_MS,
  randomRevealCandidate,
  STATTRAK_ODDS,
} from "./reveal-animation-random.js";
export {
  generateLandingDuration,
  generateLandingJitter,
  LANDING_EDGE_BIAS_EXPONENT,
  landingProgress,
  REVEAL_NOMINAL_DURATION_MS,
  REVEAL_STALL_AFTER_MS,
  waitingVelocity,
} from "./reveal-animation-timing.js";

const crateOpenSoundUrl = new URL("../../assets/audio/csgo-ui-crate-open.wav", import.meta.url).href;
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
}

const audioPools = new Map<
  string,
  { next: number; players: HTMLAudioElement[] }
>();
const reelItemStridePx = 177;
const reelItemCenterPx = 88;
const waitingLoopStartOffsetPx = 24 * reelItemStridePx + reelItemCenterPx;
const linearDecelerationDistanceRatio = 1 / 2;
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
  const setReelElement = (element: HTMLDivElement) =>
    void (reelElement = element);
  let waitingStartedAt = 0;
  let currentWaitingVelocity = waitingVelocity(0);
  let landingPlan:
    | {
        distance: number;
        duration: number;
        offset: number;
        startedAt: number;
        startOffset: number;
      }
    | undefined;

  useEscapeDismiss(() => props.open, props.onComplete);

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
              currentWaitingVelocity = waitingVelocity(0);
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
        const elapsedWaiting = Math.max(
          0,
          window.performance.now() - waitingStartedAt,
        );
        currentWaitingVelocity = waitingVelocity(elapsedWaiting);
        const targetLandingDuration = generateLandingDuration(elapsedWaiting);
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
        // Card alignment and landing jitter slightly alter the planned travel
        // distance. Derive duration from the final distance so the quadratic
        // easing begins at exactly the current reel velocity and cannot appear
        // to accelerate when the result becomes available.
        const duration = Math.max(
          1,
          Math.round(
            landingDistance /
              currentWaitingVelocity /
              linearDecelerationDistanceRatio,
          ),
        );
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
          class="modal-backdrop reveal-overlay"
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
              <ModalCloseRow
                label="Close animation"
                buttonClass="border-slate-600 bg-slate-950"
                onClose={props.onComplete}
              />
            </Show>
            <Show when={props.mode !== "slot-machine"}>
              <p class="reveal-eyebrow">{props.title}</p>
            </Show>
            <ModeContent
              count={count()}
              revealed={revealed()}
              rolling={rolling()}
              waiting={waiting()}
              reel={reel()}
              reelRef={setReelElement}
              travel={travel()}
              {...props}
            />
          </div>
        </div>
      </Show>
    </Portal>
  );
}
