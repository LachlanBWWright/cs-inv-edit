import { Show, type Accessor } from "solid-js";
import type {
  EconomyInventoryItemDto,
  TF2InspectedItem,
} from "@cs-inv-edit/contracts";
import { TF2StrangeWorkshop } from "../tf2/TF2StrangeWorkshop.js";
import { TF2DecalTool } from "../tf2/TF2DecalTool.js";
import type { GameInventoryViewProps } from "./GameInventoryView.js";
import type { createGameInventoryModel } from "./game-inventory-model.js";
import { TF2ContainerContents } from "./tf2-container-contents.js";

type TF2InspectPreview = TF2InspectedItem;

function TF2InspectResult(props: {
  preview: TF2InspectPreview;
  inspectedAt?: string | number;
}) {
  return (
    <div class="rounded-lg border border-slate-800 bg-slate-950 p-3">
      <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">
        Resolved inspect result
      </p>
      <p class="mt-1 text-sm text-slate-200">
        Item {String(props.preview.id ?? "preview")}
      </p>
      <p class="mt-1 text-xs text-slate-500">
        Definition {String(props.preview.definitionId ?? "unknown")} · quality{" "}
        {String(props.preview.qualityId ?? "unknown")} · level{" "}
        {String(props.preview.level ?? "unknown")}
      </p>
      <dl class="mt-3 grid grid-cols-2 gap-2 text-xs">
        <Detail
          label="Original item"
          value={String(props.preview.originalId ?? "Unavailable")}
        />
        <Detail
          label="Style"
          value={String(props.preview.style ?? "Default")}
        />
        <Detail
          label="Custom name"
          value={String(props.preview.customName ?? "None")}
        />
        <Detail
          label="Equipped states"
          value={String((props.preview.equippedStates ?? []).length)}
        />
        <Detail
          label="Attributes"
          value={String((props.preview.attributes ?? []).length)}
        />
        <Detail
          label="Nested item"
          value={props.preview.interiorItem ? "Present" : "None"}
        />
      </dl>
      <Show when={props.inspectedAt} keyed>
        {(inspectedAt) => (
          <p class="mt-2 text-xs text-slate-600">
            Resolved {new Date(inspectedAt).toLocaleString()}
          </p>
        )}
      </Show>
    </div>
  );
}

function Detail(props: { label: string; value: string }) {
  return (
    <div>
      <dt class="text-slate-600">{props.label}</dt>
      <dd class="break-all text-slate-300">{props.value}</dd>
    </div>
  );
}

function TF2InspectPanel(props: {
  item: Accessor<EconomyInventoryItemDto>;
  resolveTF2Inspect: (url: string) => void;
  inspectRequestedAt: Accessor<number>;
  inspectedTF2Item: Accessor<TF2InspectPreview | undefined>;
  viewProps: GameInventoryViewProps;
}) {
  return (
    <>
      <Show when={props.item().inspectUrl}>
        <button
          type="button"
          class="block w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-center text-sm text-slate-200 hover:bg-slate-800"
          onClick={() =>
            void props.resolveTF2Inspect(props.item().inspectUrl ?? "")
          }
        >
          Resolve inspect details
        </button>
      </Show>
      <Show when={props.inspectRequestedAt() > 0 && !props.inspectedTF2Item()}>
        <p class="text-xs text-slate-500">
          Waiting for the TF2 Game Coordinator to resolve this item…
        </p>
      </Show>
      <Show when={props.inspectedTF2Item()}>
        {(preview) => (
          <TF2InspectResult
            preview={preview()}
            inspectedAt={props.viewProps.tf2Features?.inspectedAt}
          />
        )}
      </Show>
    </>
  );
}

function TF2ActionSection(props: {
  item: Accessor<EconomyInventoryItemDto>;
  viewProps: GameInventoryViewProps;
  model: ReturnType<typeof createGameInventoryModel>;
}) {
  const item = props.item;
  const {
    operationStatus,
    confirmUseItemId,
    setConfirmUseItemId,
    confirmStrangeResetId,
    setConfirmStrangeResetId,
    inspectRequestedAt,
    snapshot,
    selectedTF2Details,
    selectedTF2Item,
    previewTF2Container,
    submitTF2Operation,
    resolveTF2Inspect,
    inspectedTF2Item,
  } = props.model;
  const confirmStrangeReset = () => {
    setConfirmStrangeResetId(undefined);
    void submitTF2Operation("tf2.tools.strange-reset", {
      game: "tf2",
      itemId: item().assetId,
      confirmed: true,
    });
  };
  const confirmUse = () => {
    setConfirmUseItemId(undefined);
    void submitTF2Operation("tf2.items.use", {
      game: "tf2",
      itemId: item().assetId,
      confirmed: true,
    });
  };
  return (
    <div class="mt-4 space-y-2 border-t border-slate-800 pt-4">
      <TF2InspectPanel
        item={item}
        resolveTF2Inspect={resolveTF2Inspect}
        inspectRequestedAt={inspectRequestedAt}
        inspectedTF2Item={inspectedTF2Item}
        viewProps={props.viewProps}
      />
      <Show
        when={
          props.viewProps.settings?.featureFlags.enableTf2Customization &&
          selectedTF2Item() &&
          props.viewProps.onOperation
        }
      >
        <TF2DecalTool
          target={selectedTF2Item()!}
          items={(snapshot()?.items ?? []).filter(
            (
              candidate,
            ): candidate is Extract<EconomyInventoryItemDto, { game: "tf2" }> =>
              candidate.game === "tf2",
          )}
          onOperation={props.viewProps.onOperation!}
        />
      </Show>
      <Show
        when={
          props.viewProps.settings?.featureFlags.enableTf2Tools &&
          selectedTF2Details()?.schemaQuality?.toLowerCase() === "strange" &&
          confirmStrangeResetId() !== item().assetId
        }
      >
        <button
          class="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800"
          onClick={() => setConfirmStrangeResetId(item().assetId)}
        >
          Reset Strange counters
        </button>
      </Show>
      <Show
        when={
          props.viewProps.settings?.featureFlags.enableTf2Tools &&
          selectedTF2Item() &&
          selectedTF2Details()?.schemaQuality?.toLowerCase() === "strange" &&
          props.viewProps.onOperation
        }
      >
        <TF2StrangeWorkshop
          item={selectedTF2Item()!}
          items={(snapshot()?.items ?? []).filter(
            (
              candidate,
            ): candidate is Extract<EconomyInventoryItemDto, { game: "tf2" }> =>
              candidate.game === "tf2",
          )}
          enabled={
            props.viewProps.settings?.featureFlags.enableTf2Tools === true
          }
          onOperation={props.viewProps.onOperation!}
        />
      </Show>
      <Show when={confirmStrangeResetId() === item().assetId}>
        <div class="rounded-lg border border-red-900 bg-slate-950 p-3">
          <p class="text-xs text-slate-300">
            Reset every Strange counter on this item permanently?
          </p>
          <div class="mt-2 flex gap-2">
            <button
              class="rounded-lg bg-red-800 px-3 py-1.5 text-xs text-white"
              onClick={confirmStrangeReset}
            >
              Reset counters
            </button>
            <button
              class="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300"
              onClick={() => setConfirmStrangeResetId(undefined)}
            >
              Cancel
            </button>
          </div>
        </div>
      </Show>
      <Show
        when={
          props.viewProps.settings?.featureFlags.enableTf2ItemUse &&
          confirmUseItemId() !== item().assetId
        }
      >
        <button
          type="button"
          class="w-full rounded-xl border border-amber-500/40 bg-amber-950 px-3 py-2 text-sm text-amber-100"
          onClick={() => setConfirmUseItemId(item().assetId)}
        >
          Use TF2 item
        </button>
      </Show>
      <Show
        when={
          props.viewProps.settings?.featureFlags.enableTf2ItemUse &&
          confirmUseItemId() === item().assetId
        }
      >
        <div class="rounded-xl border border-red-500/40 bg-red-950 p-3">
          <p class="text-xs text-red-100">
            This permanently consumes or changes {item().name}. Confirm the
            exact item ID <span class="font-mono">{item().assetId}</span>.
          </p>
          <div class="mt-2 flex gap-2">
            <button
              type="button"
              class="rounded-lg bg-red-700 px-3 py-1.5 text-xs text-white"
              onClick={confirmUse}
            >
              Confirm permanent use
            </button>
            <button
              type="button"
              class="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300"
              onClick={() => setConfirmUseItemId(undefined)}
            >
              Cancel
            </button>
          </div>
        </div>
      </Show>
      <Show when={selectedTF2Details()?.itemKind === "container"}>
        <p class="text-xs text-slate-500">
          TF2 unboxing remains capture-gated. Enabling its permanent-action flag
          does not bypass the backend protocol-evidence block.
        </p>
      </Show>
      <Show
        when={
          selectedTF2Details()?.itemKind === "container" &&
          selectedTF2Details()?.containerItems?.length
        }
      >
        <TF2ContainerContents
          items={() => selectedTF2Details()?.containerItems ?? []}
        />
      </Show>
      <Show
        when={
          props.viewProps.settings?.featureFlags.enableTf2Unboxing &&
          selectedTF2Details()?.itemKind === "container" &&
          selectedTF2Details()?.containerItems?.some(
            (entry) => entry.poolKind !== "unresolved",
          )
        }
      >
        <button
          type="button"
          class="w-full rounded-xl border border-violet-500/40 bg-violet-950 px-3 py-2 text-sm text-violet-100"
          onClick={previewTF2Container}
        >
          Preview unboxing animation
        </button>
        <p class="text-xs text-slate-500">
          Offline preview only; no item is consumed or awarded.
        </p>
      </Show>
      <Show when={operationStatus()}>
        <p class="text-xs text-slate-400">{operationStatus()}</p>
      </Show>
    </div>
  );
}

export function GameInventoryTF2Actions(input: {
  props: GameInventoryViewProps;
  model: ReturnType<typeof createGameInventoryModel>;
  item: Accessor<EconomyInventoryItemDto>;
}) {
  return (
    <>
      <Show when={input.item().game === "tf2"}>
        <TF2ActionSection
          item={input.item}
          viewProps={input.props}
          model={input.model}
        />
      </Show>
    </>
  );
}
