import { createEffect, createSignal, onCleanup, Show } from "solid-js";
import { Portal } from "solid-js/web";
import type {
  RevealAnimationMode,
  TradeUpAnimationMode,
} from "@cs-inv-edit/contracts";
import { RevealAnimation, type RevealItem } from "./RevealAnimation.js";
import { ModalCloseRow } from "./ModalBackdrop.js";
import { useEscapeDismiss } from "./modal-dismiss.js";

interface TradeUpContractRevealProps {
  open: boolean;
  ready?: boolean;
  mode: TradeUpAnimationMode;
  candidates: RevealItem[];
  result: RevealItem;
  onComplete: () => void;
}

const underlyingMode = (mode: TradeUpAnimationMode): RevealAnimationMode => {
  if (mode === "contract-countdown") return "countdown";
  if (mode === "contract-slot-machine") return "slot-machine";
  return "none";
};

export function TradeUpContractReveal(props: TradeUpContractRevealProps) {
  let canvas: HTMLCanvasElement | undefined;
  const [phase, setPhase] = createSignal<"contract" | "reveal" | "result">(
    "contract",
  );
  const [hasInk, setHasInk] = createSignal(false);
  let drawing = false;

  createEffect(() => {
    if (!props.open) return;
    setPhase("contract");
    setHasInk(false);
    window.requestAnimationFrame(() => {
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const scale = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.round(rect.width * scale));
      canvas.height = Math.max(1, Math.round(rect.height * scale));
      canvas.getContext("2d")?.scale(scale, scale);
    });
  });

  useEscapeDismiss(
    () => props.open && phase() !== "reveal",
    props.onComplete,
  );

  const point = (event: PointerEvent) => {
    const rect = canvas!.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  const begin = (event: PointerEvent) => {
    if (!canvas) return;
    drawing = true;
    canvas.setPointerCapture(event.pointerId);
    const context = canvas.getContext("2d");
    const start = point(event);
    context?.beginPath();
    context?.moveTo(start.x, start.y);
  };
  const draw = (event: PointerEvent) => {
    if (!drawing || !canvas) return;
    const context = canvas.getContext("2d");
    const next = point(event);
    if (!context) return;
    context.strokeStyle = "#17202a";
    context.lineWidth = Math.max(
      1.5,
      Math.min(4, event.pressure ? event.pressure * 4 : 2.4),
    );
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineTo(next.x, next.y);
    context.stroke();
    setHasInk(true);
  };
  const end = () => {
    drawing = false;
  };
  const clear = () => {
    if (!canvas) return;
    canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    setHasInk(false);
  };
  const submit = () =>
    setPhase(underlyingMode(props.mode) === "none" ? "result" : "reveal");

  onCleanup(() => {
    drawing = false;
  });

  return (
    <>
      <Portal>
        <Show when={props.open && phase() !== "reveal"}>
          <div
            class="modal-backdrop contract-overlay"
            role="dialog"
            aria-modal="true"
            aria-label="Trade Up Contract"
          >
            <div class="contract-desk">
              <ModalCloseRow
                label="Close trade-up contract"
                buttonClass="border-stone-500 bg-stone-950 text-stone-100"
                onClose={props.onComplete}
              />
              <section class="contract-paper">
                <div class="contract-seal">CS</div>
                <p class="contract-kicker">Arms Replacement Agreement</p>
                <h2>Trade Up Contract</h2>
                <Show
                  when={phase() === "contract"}
                  fallback={
                    <div class="contract-result">
                      <p>Contract accepted</p>
                      <strong>{props.result.name}</strong>
                      <Show when={props.result.imageUrl}>
                        <img src={props.result.imageUrl} alt="" />
                      </Show>
                      <button type="button" onClick={props.onComplete}>
                        Done
                      </button>
                    </div>
                  }
                >
                  <p class="contract-copy">
                    I hereby relinquish the submitted items in exchange for one
                    item of superior grade. Sign within the field below to
                    authorize this contract.
                  </p>
                  <div class="contract-rule" />
                  <p class="contract-sign-label">Authorized signature</p>
                  <canvas
                    ref={(element) => {
                      canvas = element;
                    }}
                    class="contract-canvas"
                    onPointerDown={begin}
                    onPointerMove={draw}
                    onPointerUp={end}
                    onPointerCancel={end}
                    onPointerLeave={end}
                  />
                  <div class="contract-actions">
                    <button
                      type="button"
                      class="contract-clear"
                      onClick={clear}
                    >
                      Clear
                    </button>
                    <button
                      type="button"
                      class="contract-submit"
                      disabled={!hasInk()}
                      onClick={submit}
                    >
                      Submit contract
                    </button>
                  </div>
                </Show>
              </section>
            </div>
          </div>
        </Show>
      </Portal>
      <RevealAnimation
        open={props.open && phase() === "reveal"}
        ready={props.ready}
        mode={underlyingMode(props.mode)}
        title="Trade-up contract"
        candidates={props.candidates}
        result={props.result}
        onComplete={props.onComplete}
      />
    </>
  );
}
