import { For, Show } from "solid-js";
import type { InventoryItemDto, RelatedItemDto } from "@cs-inv-edit/contracts";
import { Button } from "./ui/Button.js";
import { Select } from "./ui/Select.js";
import { Alert } from "./ui/Alert.js";
import {
  isActiveTerminal,
  isOpenableContainer,
  itemDisplayName,
  rarityBorderClass,
} from "./inventory-view-utils.js";
import { formatFloat } from "./item-instance-utils.js";
import type { ReturnEstimate } from "./roi-utils.js";
import { ReturnEstimateCard } from "./ReturnEstimateCard.js";

function steamMarketURL(marketName: string) {
  return `https://steamcommunity.com/market/listings/730/${encodeURIComponent(marketName)}`;
}

function tradeUpInputCount(item: InventoryItemDto) {
  const covert = ["ancient", "covert", "extraordinary", "master"].includes(
    (item.rarity ?? "").toLowerCase(),
  );
  return covert ? 5 : 10;
}

export interface TradeUpOutcomesProps {
  selected: InventoryItemDto;
  onPreview?: (item: InventoryItemDto) => void;
  returnEstimate?: ReturnEstimate;
  returnEstimateLoading?: boolean;
}

function TradeUpOutcomeCard(props: { outcome: RelatedItemDto }) {
  return (
    <article
      class={`rounded-xl border-2 bg-slate-950 p-3 ${rarityBorderClass(props.outcome.rarity)}`}
    >
      <div class="flex gap-3">
        <Show
          when={props.outcome.imageUrl}
          fallback={
            <div class="grid h-16 w-20 shrink-0 place-items-center rounded bg-slate-900 text-xs text-slate-600">
              No image
            </div>
          }
        >
          <img
            class="h-16 w-20 shrink-0 rounded bg-slate-900 object-contain"
            src={props.outcome.imageUrl}
            alt=""
            loading="lazy"
          />
        </Show>
        <div class="min-w-0">
          <p class="font-medium text-slate-100">
            {props.outcome.marketName || props.outcome.name}
          </p>
          <Show when={props.outcome.paintWear !== undefined}>
            <p class="mt-1 font-mono text-xs text-slate-300">
              Float {formatFloat(props.outcome.paintWear!)}
            </p>
          </Show>
          <p class="mt-1 text-xs text-slate-400">
            {props.outcome.marketName
              ? "Market preview available"
              : "Market price unavailable"}
          </p>
        </div>
      </div>
      <Show when={props.outcome.marketName}>
        <a
          class="mt-3 inline-block text-xs font-medium text-sky-300 hover:text-sky-200"
          href={steamMarketURL(props.outcome.marketName!)}
          target="_blank"
          rel="noreferrer"
        >
          Steam Market ↗
        </a>
      </Show>
    </article>
  );
}

export function TradeUpOutcomes(props: TradeUpOutcomesProps) {
  return (
    <Show
      when={
        props.selected.kind === "weapon_skin" &&
        (props.selected.tradeUpItems?.length ?? 0) > 0
      }
    >
      <section class="rounded-2xl border border-slate-800/80 bg-slate-900 p-4">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <h4 class="font-semibold text-slate-100">
            Identical-copy trade-up outcomes
          </h4>
          <button
            type="button"
            class="rounded-md border border-cyan-500/40 bg-cyan-950 px-3 py-2 text-sm font-medium text-white hover:bg-cyan-500"
            onClick={() => props.onPreview?.(props.selected)}
          >
            Preview trade-up animation
          </button>
        </div>
        <p class="mt-1 text-xs text-slate-400">
          Possible results from {tradeUpInputCount(props.selected)} identical
          copies. Wear uses normalized input float mapped into each output
          finish’s range.{" "}
          {props.selected.isSouvenir
            ? "Souvenir attributes are removed; results are normal items."
            : ""}
        </p>
        <div class="mt-3">
          <ReturnEstimateCard
            estimate={props.returnEstimate}
            loading={props.returnEstimateLoading}
            costLabel="Identical-copy inputs"
            note="Expected value uses equal odds for this collection’s displayed outcomes and current market prices; Steam fees are excluded."
          />
        </div>
        <div class="mt-3 grid gap-3 sm:grid-cols-2">
          <For each={props.selected.tradeUpItems}>
            {(outcome) => <TradeUpOutcomeCard outcome={outcome} />}
          </For>
        </div>
      </section>
    </Show>
  );
}

export interface ActionBarProps {
  selected: InventoryItemDto;
  pending: boolean;
  canOpenContainer: boolean;
  canUseNameTagOn: boolean;
  compatibleContainerKey: InventoryItemDto | undefined;
  compatibleContainerKeys: InventoryItemDto[];
  selectedContainerKeyId: string;
  containerStatusMessage: string;
  onOpenContainer: (terminalSelection?: {
    pointsRemaining?: number;
    volatileLimit?: number;
  }) => Promise<void> | void;
  onOpenRenameEditor: (item: InventoryItemDto) => void;
  onRemoveName: () => Promise<void> | void;
  onShowContents: () => void;
  onViewStorageContents: () => Promise<void> | void;
  onBeginMoveIntoStorage: (item: InventoryItemDto) => void;
  onSelectedContainerKeyChange: (value: string) => void;
}

function ContainerKeyControl(
  props: Pick<
    ActionBarProps,
    | "selected"
    | "compatibleContainerKeys"
    | "selectedContainerKeyId"
    | "onSelectedContainerKeyChange"
  >,
) {
  const keyState = (props.selected.requiredKeyDefIndexes?.length ?? 0) > 0;
  if (!keyState) {
    return null;
  }
  if (props.compatibleContainerKeys.length === 0) {
    return (
      <Alert variant="warning" class="p-3">
        <p class="font-medium">Compatible key required</p>
        <p class="mt-1 text-xs text-amber-200">
          This container requires a compatible key, but none is present in your
          inventory.
        </p>
      </Alert>
    );
  }
  return (
    <label class="block text-sm font-medium text-slate-200">
      Choose a compatible key
      <Select
        class="mt-2 w-full"
        value={props.selectedContainerKeyId}
        onChange={(event) =>
          props.onSelectedContainerKeyChange(
            (event.currentTarget as HTMLSelectElement | null)?.value ?? "",
          )
        }
      >
        <option value="">Select a key…</option>
        <For each={props.compatibleContainerKeys}>
          {(key) => <option value={key.id}>{itemDisplayName(key)}</option>}
        </For>
      </Select>
    </label>
  );
}

export function ActionBar(props: ActionBarProps) {
  const showOpenContainer = () =>
    !isActiveTerminal(props.selected) &&
    (props.canOpenContainer || isOpenableContainer(props.selected));
  const requiresKeySelection = () =>
    (props.selected.requiredKeyDefIndexes?.length ?? 0) > 0 &&
    !props.compatibleContainerKey;

  return (
    <div class="flex flex-wrap gap-2">
      <Show when={showOpenContainer() || props.selected.containerItems?.length}>
        <section class="w-full space-y-4 rounded-xl border border-slate-800 bg-slate-950 p-4">
          <p class="text-sm font-semibold text-slate-100">Open container</p>
          <Show when={showOpenContainer()}>
            <ContainerKeyControl
              selected={props.selected}
              compatibleContainerKeys={props.compatibleContainerKeys}
              selectedContainerKeyId={props.selectedContainerKeyId}
              onSelectedContainerKeyChange={props.onSelectedContainerKeyChange}
            />
          </Show>
          <div class="grid gap-2 sm:grid-cols-2">
            <Show when={props.selected.containerItems?.length}>
              <Button
                variant="secondary"
                class="w-full"
                onClick={() => props.onShowContents()}
              >
                View contents ({props.selected.containerItems?.length})
              </Button>
            </Show>
            <Show when={showOpenContainer()}>
              <Button
                class="w-full"
                onClick={() => void props.onOpenContainer()}
                disabled={props.pending}
              >
                {requiresKeySelection() ? "Choose key" : "Open"}
              </Button>
            </Show>
          </div>
          <Show when={props.containerStatusMessage}>
            <p class="text-sm text-slate-400">{props.containerStatusMessage}</p>
          </Show>
        </section>
      </Show>
      <Show when={props.selected.kind === "storage_unit"}>
        <div class="grid gap-2 sm:grid-cols-2">
          <Button
            variant="action"
            size="lg"
            class="w-full rounded-xl py-3"
            onClick={() => void props.onViewStorageContents()}
            disabled={props.pending}
          >
            View contents ({props.selected.storageCount ?? 0})
          </Button>
          <Button
            variant="action"
            size="lg"
            class="w-full rounded-xl py-3"
            onClick={() => props.onBeginMoveIntoStorage(props.selected)}
            disabled={
              props.pending || (props.selected.storageCount ?? 0) >= 1000
            }
          >
            Move items into unit
          </Button>
        </div>
      </Show>
      <Show when={props.canUseNameTagOn}>
        <Button
          variant="secondary"
          onClick={() => props.onOpenRenameEditor(props.selected)}
          disabled={props.pending}
        >
          Rename
        </Button>
      </Show>
      <Show when={props.selected.hasCustomName || props.selected.customName}>
        <Button
          variant="danger"
          class="bg-rose-950 hover:bg-rose-500"
          onClick={() => void props.onRemoveName()}
          disabled={props.pending}
        >
          Remove custom name
        </Button>
      </Show>
    </div>
  );
}
