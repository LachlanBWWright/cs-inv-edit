import { Show, createSignal } from "solid-js";
import type { RelatedItemDto } from "@cs-inv-edit/contracts";
import { rarityBorderClass } from "./inventory-view-utils.js";
import {
  formatProbability,
  isWeaponFinish,
  steamMarketSearchURL,
  steamMarketURL,
} from "./related-item-preview-utils.js";
import { WearRangeBar } from "../../shared/ui/WearRangeBar.js";
import { Button } from "../../shared/ui/Button.js";

import type { RelatedItemPreviewContext } from "../../shared/ui-types.js";

export type { RelatedItemPreviewContext } from "../../shared/ui-types.js";

export function RelatedItemPreview(props: {
  item: RelatedItemDto;
  context?: RelatedItemPreviewContext;
  probability?: number;
  onRequestMarketPreview?: (
    marketName: string,
  ) => Promise<RelatedItemDto | undefined>;
  onOpenCollection?: (item: RelatedItemDto) => void;
}) {
  const [failed, setFailed] = createSignal(false);
  const [marketPreview, setMarketPreview] = createSignal<RelatedItemDto>();
  const [marketLoading, setMarketLoading] = createSignal(false);
  const [marketRequested, setMarketRequested] = createSignal(false);
  const item = () => ({ ...props.item, ...marketPreview() });
  const label = () => item().marketName || item().name;
  const requestMarketPreview = async () => {
    const marketName = item().marketName;
    if (
      !marketName ||
      item().price ||
      marketRequested() ||
      !props.onRequestMarketPreview
    )
      return;
    setMarketRequested(true);
    setMarketLoading(true);
    const preview = await props.onRequestMarketPreview(marketName);
    if (preview) setMarketPreview(preview);
    else setMarketRequested(false);
    setMarketLoading(false);
  };

  return (
    <details
      class={`group rounded-xl border-2 bg-slate-900 ${rarityBorderClass(item().rarity)}`}
      onToggle={(event) => {
        if (event.currentTarget.open) void requestMarketPreview();
      }}
    >
      <summary class="flex cursor-pointer list-none items-center gap-3 p-3 marker:content-none">
        <div class="w-24 shrink-0">
          <Show
            when={item().imageUrl && !failed()}
            fallback={
              <div class="mx-auto flex h-12 w-16 items-center justify-center rounded bg-slate-950 text-xs font-semibold text-slate-600">
                {label().slice(0, 2).toUpperCase()}
              </div>
            }
          >
            <img
              class="mx-auto h-12 w-16 rounded bg-slate-950 object-contain"
              src={item().imageUrl}
              alt={label()}
              loading="lazy"
              referrerpolicy="no-referrer"
              onError={() => setFailed(true)}
            />
          </Show>
          <Show when={props.context === "collection" && isWeaponFinish(item())}>
            <WearRangeBar compact min={item().wearMin} max={item().wearMax} />
          </Show>
        </div>
        <div class="min-w-0 flex-1">
          <p class="truncate font-medium text-slate-100">{label()}</p>
          <Show
            when={
              props.context === "container" && props.probability !== undefined
            }
          >
            <p class="mt-1 text-xs text-cyan-200">
              Base drop chance {formatProbability(props.probability!)}
            </p>
          </Show>
        </div>
        <span
          class="text-xs text-slate-500 transition-transform group-open:rotate-180"
          aria-hidden="true"
        >
          ▼
        </span>
      </summary>
      <div class="border-t border-slate-800/80 px-3 pb-3 pt-3 text-xs text-slate-400">
        <dl class="grid gap-2 sm:grid-cols-2">
          <Show when={item().price}>
            <div>
              <dt class="uppercase tracking-wide text-slate-500">
                Market price
              </dt>
              <dd class="mt-1 font-medium text-slate-200">{item().price}</dd>
            </div>
          </Show>
          <Show when={isWeaponFinish(item())}>
            <div>
              <dt class="uppercase tracking-wide text-slate-500">Float caps</dt>
              <dd class="mt-1 font-mono text-slate-200">
                {(item().wearMin ?? 0).toFixed(6)}–
                {(item().wearMax ?? 1).toFixed(6)}
              </dd>
            </div>
          </Show>
          <Show when={props.item.paintWear !== undefined}>
            <div>
              <dt class="uppercase tracking-wide text-slate-500">
                Predicted float
              </dt>
              <dd class="mt-1 font-mono text-slate-200">
                {props.item.paintWear?.toFixed(8)}
              </dd>
            </div>
          </Show>
        </dl>
        <Show
          when={props.context === "container" && isWeaponFinish(props.item)}
        >
          <p class="mt-3 text-slate-500">
            StatTrak™ chance when supported: 10% of this item’s base drop chance
            ({formatProbability((props.probability ?? 0) * 0.1)}).
          </p>
        </Show>
        <Show
          when={item().listingName}
          fallback={
            <Show when={item().marketName}>
              <a
                class="mt-3 inline-block font-medium text-sky-300 underline decoration-sky-500/50 underline-offset-4 hover:text-sky-200"
                href={steamMarketSearchURL(item().marketName!)}
                target="_blank"
                rel="noreferrer"
              >
                Search Steam Market ↗
              </a>
            </Show>
          }
        >
          <a
            class="mt-3 inline-block font-medium text-sky-300 underline decoration-sky-500/50 underline-offset-4 hover:text-sky-200"
            href={steamMarketURL(item().listingName!)}
            target="_blank"
            rel="noreferrer"
          >
            Open exact Steam listing ↗
          </a>
        </Show>
        <Show when={marketLoading()}>
          <p class="mt-2 animate-pulse text-cyan-200">
            Loading this listing from Steam Market…
          </p>
        </Show>
        <Show when={!item().price && !marketLoading()}>
          <p class="mt-2 text-slate-500">
            Expand this item to load its current Steam Market listing.
          </p>
        </Show>
        <Show when={item().kind === "item_collection"}>
          <Button
            class="mt-3"
            onClick={() => props.onOpenCollection?.(item())}
          >
            View collection
            {item().items?.length ? ` (${item().items!.length})` : ""}
          </Button>
        </Show>
      </div>
    </details>
  );
}
