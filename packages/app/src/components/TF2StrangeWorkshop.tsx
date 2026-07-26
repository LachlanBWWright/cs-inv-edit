import { For, Show, createMemo, createSignal } from "solid-js";
import type {
  EconomyInventoryItemDto,
  OperationReceipt,
} from "@cs-inv-edit/contracts";

type TF2Item = Extract<EconomyInventoryItemDto, { game: "tf2" }>;
type StrangeAction = "part" | "restriction" | "transfer" | "remove";

function normalizedTool(item: TF2Item) {
  return `${item.name} ${item.details.toolType ?? ""} ${item.details.itemClass ?? ""}`.toLowerCase();
}

function toolsFor(items: TF2Item[], action: StrangeAction) {
  return items.filter((item) => {
    const value = normalizedTool(item);
    if (action === "part") return value.includes("strange part");
    if (action === "restriction") return value.includes("strange") && value.includes("restriction");
    if (action === "transfer") return value.includes("strange") && value.includes("transfer");
    return false;
  });
}

function strangeTargets(items: TF2Item[], selected: TF2Item) {
  return items.filter(
    (item) =>
      item.assetId !== selected.assetId &&
      item.details.schemaQuality?.toLowerCase() === "strange" &&
      (item.definitionId === selected.definitionId ||
        item.details.itemClass === selected.details.itemClass),
  );
}

function counterChoices(item: TF2Item) {
  return (item.details.decodedAttributes ?? [])
    .filter((attribute) => {
      const name = `${attribute.name} ${attribute.attributeClass}`.toLowerCase();
      return name.includes("score type") || name.includes("kill eater");
    })
    .map((attribute) => ({
      label: attribute.name || `Counter ${attribute.defIndex}`,
      value:
        item.details.attributes?.[String(attribute.defIndex)] ??
        attribute.defIndex,
    }))
    .filter(
      (entry, index, entries) =>
        entry.value > 0 &&
        entries.findIndex((candidate) => candidate.value === entry.value) ===
          index,
    );
}

export function TF2StrangeWorkshop(props: {
  item: TF2Item;
  items: TF2Item[];
  enabled: boolean;
  onOperation: (type: string, input: unknown) => Promise<OperationReceipt>;
}) {
  const [action, setAction] = createSignal<StrangeAction>("part");
  const [toolId, setToolId] = createSignal("");
  const [destinationId, setDestinationId] = createSignal("");
  const [scoreType, setScoreType] = createSignal(0);
  const [confirming, setConfirming] = createSignal(false);
  const [status, setStatus] = createSignal("");
  const tools = createMemo(() => toolsFor(props.items, action()));
  const destinations = createMemo(() => strangeTargets(props.items, props.item));
  const counters = createMemo(() => counterChoices(props.item));

  const submit = async () => {
    if (!props.enabled) return;
    const base = { game: "tf2", confirmed: true };
    let request:
      | { type: string; input: Record<string, unknown> }
      | undefined;
    if (action() === "part" && toolId()) {
      request = {
        type: "tf2.tools.strange-part",
        input: { ...base, toolItemId: toolId(), targetItemId: props.item.assetId },
      };
    } else if (action() === "restriction" && toolId()) {
      request = {
        type: "tf2.tools.strange-restriction",
        input: {
          ...base,
          toolItemId: toolId(),
          targetItemId: props.item.assetId,
          attributeIndex: scoreType(),
        },
      };
    } else if (action() === "transfer" && toolId() && destinationId()) {
      request = {
        type: "tf2.tools.strange-transfer",
        input: {
          ...base,
          toolItemId: toolId(),
          sourceItemId: props.item.assetId,
          destinationItemId: destinationId(),
        },
      };
    } else if (action() === "remove" && scoreType()) {
      request = {
        type: "tf2.tools.strange-remove",
        input: { ...base, itemId: props.item.assetId, scoreType: scoreType() },
      };
    }
    if (!request) return;
    setConfirming(false);
    const receipt = await props.onOperation(request.type, request.input);
    setStatus(receipt.message || receipt.state);
  };

  return (
    <Show when={props.enabled}>
      <section class="rounded-lg border border-slate-800 bg-slate-950 p-3">
        <h3 class="text-sm font-semibold text-slate-200">Strange counters</h3>
        <div class="mt-3 grid grid-cols-2 gap-2">
          <For each={[
            ["part", "Apply part"],
            ["restriction", "Add restriction"],
            ["transfer", "Transfer counts"],
            ["remove", "Remove counter"],
          ] as const}>
            {([value, label]) => (
              <button
                class={`rounded-lg border px-2 py-2 text-xs ${action() === value ? "border-slate-500 bg-slate-800 text-white" : "border-slate-800 text-slate-400"}`}
                onClick={() => {
                  setAction(value);
                  setToolId("");
                  setDestinationId("");
                  setScoreType(0);
                  setConfirming(false);
                }}
              >
                {label}
              </button>
            )}
          </For>
        </div>

        <Show when={action() !== "remove"}>
          <label class="mt-3 grid gap-1 text-xs text-slate-400">
            <span>Compatible owned tool</span>
            <select
              class="h-9 rounded-lg border border-slate-700 bg-slate-900 px-2 text-sm text-slate-200"
              value={toolId()}
              onInput={(event) => setToolId(event.currentTarget.value)}
            >
              <option value="">Select an item</option>
              <For each={tools()}>
                {(item) => <option value={item.assetId}>{item.name}</option>}
              </For>
            </select>
          </label>
          <Show when={tools().length === 0}>
            <p class="mt-2 text-xs text-slate-500">
              No compatible owned tool was found.
            </p>
          </Show>
        </Show>

        <Show when={action() === "restriction" || action() === "remove"}>
          <label class="mt-3 grid gap-1 text-xs text-slate-400">
            <span>Existing counter</span>
            <select
              class="h-9 rounded-lg border border-slate-700 bg-slate-900 px-2 text-sm text-slate-200"
              value={scoreType()}
              onInput={(event) => setScoreType(Number(event.currentTarget.value))}
            >
              <option value="0">Select a counter</option>
              <For each={counters()}>
                {(counter) => (
                  <option value={counter.value}>{counter.label}</option>
                )}
              </For>
            </select>
          </label>
        </Show>

        <Show when={action() === "transfer"}>
          <label class="mt-3 grid gap-1 text-xs text-slate-400">
            <span>Compatible owned destination</span>
            <select
              class="h-9 rounded-lg border border-slate-700 bg-slate-900 px-2 text-sm text-slate-200"
              value={destinationId()}
              onInput={(event) => setDestinationId(event.currentTarget.value)}
            >
              <option value="">Select an item</option>
              <For each={destinations()}>
                {(item) => <option value={item.assetId}>{item.name}</option>}
              </For>
            </select>
          </label>
        </Show>

        <Show
          when={
            (action() === "remove" && scoreType() > 0) ||
            (action() === "transfer" && toolId() && destinationId()) ||
            ((action() === "part" || action() === "restriction") && toolId())
          }
        >
          <button
            class="mt-3 w-full rounded-lg border border-red-900 px-3 py-2 text-xs text-red-200"
            onClick={() => setConfirming(true)}
          >
            Review permanent change
          </button>
        </Show>
        <Show when={confirming()}>
          <div class="mt-3 rounded-lg border border-red-900 p-3">
            <p class="text-xs text-slate-300">
              This permanently changes {props.item.name}. The request will not
              be retried if confirmation is not received.
            </p>
            <div class="mt-2 flex gap-2">
              <button
                class="rounded-lg bg-red-800 px-3 py-1.5 text-xs text-white"
                onClick={() => void submit()}
              >
                Confirm change
              </button>
              <button
                class="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300"
                onClick={() => setConfirming(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </Show>
        <Show when={status()}>
          <p class="mt-2 text-xs text-slate-500">{status()}</p>
        </Show>
      </section>
    </Show>
  );
}
