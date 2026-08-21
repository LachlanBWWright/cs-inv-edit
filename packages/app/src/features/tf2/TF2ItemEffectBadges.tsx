import { For, Show, createMemo } from "solid-js";
import type { EconomyInventoryItemDto } from "@cs-inv-edit/contracts";
import { tf2ItemEffects, type TF2ItemEffect } from "../inventory/game-inventory-utils.js";

const labels: Record<TF2ItemEffect, string> = {
  strange: "Strange item",
  unusual: "Unusual effect",
};

function EffectIcon(props: { effect: TF2ItemEffect }) {
  return props.effect === "strange" ? (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="7" />
      <path d="M12 2v4m0 12v4M2 12h4m12 0h4M9 12h6M12 9v6" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m12 2 1.5 6.5L20 10l-6.5 1.5L12 18l-1.5-6.5L4 10l6.5-1.5L12 2Z" />
      <path d="m19 16 .7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7L19 16Z" />
    </svg>
  );
}

export function TF2ItemEffectBadges(props: { item: EconomyInventoryItemDto }) {
  const effects = createMemo(() => tf2ItemEffects(props.item));
  const isCombined = () =>
    effects().includes("strange") && effects().includes("unusual");
  return (
    <div class="tf2-effect-badges" aria-label="Item effects">
      <Show
        when={isCombined()}
        fallback={
          <For each={effects()}>
            {(effect) => (
              <span
                class={`tf2-effect-badge tf2-effect-badge--${effect}`}
                title={labels[effect]}
                aria-label={labels[effect]}
              >
                <EffectIcon effect={effect} />
              </span>
            )}
          </For>
        }
      >
        <span
          class="tf2-effect-badge tf2-effect-badge--combined"
          title="Strange + Unusual item"
          aria-label="Strange and Unusual item"
        >
          <EffectIcon effect="strange" />
          <EffectIcon effect="unusual" />
        </span>
      </Show>
    </div>
  );
}
