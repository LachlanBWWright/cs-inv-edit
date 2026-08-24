import { createMemo, createSignal, For, Show } from "solid-js";
import type {
  EconomyInventoryItemDto,
  OperationReceipt,
} from "@cs-inv-edit/contracts";
import { Alert } from "../../shared/ui/Alert.js";
import { Button } from "../../shared/ui/Button.js";
import { Dialog } from "../../shared/ui/Dialog.js";
import { Input } from "../../shared/ui/Input.js";
import { fromAppPromise } from "../../shared/lib/result.js";

type TF2Item = Extract<EconomyInventoryItemDto, { game: "tf2" }>;

const isOfferingTool = (item: TF2Item) => {
  const text = `${item.name} ${item.marketName ?? ""} ${item.details.toolType ?? ""}`.toLowerCase();
  return text.includes("halloween") &&
    (item.details.itemKind === "tool" || !!item.details.toolType || text.includes("offering"));
};

export function TF2HalloweenOfferingDialog(props: {
  open: boolean;
  items: TF2Item[];
  connected: boolean;
  enabled: boolean;
  onOpenChange: (open: boolean) => void;
  onExecute: (input: {
    toolItemId: string;
    itemIds: string[];
    confirmed: boolean;
  }) => Promise<OperationReceipt | undefined>;
  onAccepted: () => void;
}) {
  const [toolId, setToolId] = createSignal("");
  const [ingredientIds, setIngredientIds] = createSignal<string[]>([]);
  const [acknowledged, setAcknowledged] = createSignal(false);
  const [typed, setTyped] = createSignal("");
  const [pending, setPending] = createSignal(false);
  const [message, setMessage] = createSignal("");
  const tools = createMemo(() => props.items.filter(isOfferingTool));
  const ingredients = createMemo(() =>
    props.items.filter((item) => item.assetId !== toolId()),
  );
  const toggleIngredient = (id: string) => {
    setIngredientIds((current) =>
      current.includes(id)
        ? current.filter((candidate) => candidate !== id)
        : [...current, id],
    );
  };
  const canExecute = () =>
    props.enabled && props.connected && !!toolId() && ingredientIds().length > 0 &&
    acknowledged() && typed() === "OFFER" && !pending();
  const execute = () => {
    if (!canExecute()) return;
    setPending(true);
    void fromAppPromise(
      props.onExecute({ toolItemId: toolId(), itemIds: ingredientIds(), confirmed: true }),
      "TF2 Halloween offering failed",
    ).match(
      (receipt) => {
        setPending(false);
        if (receipt && ["completed", "awaiting_gc_confirmation"].includes(receipt.state)) {
          props.onAccepted();
          return;
        }
        setMessage(receipt?.message ?? "TF2 rejected the Halloween offering.");
      },
      (error) => {
        setPending(false);
        setMessage(error.message);
      },
    );
  };
  return (
    <Dialog
      open={props.open}
      title="Craft Halloween Offering"
      description="Choose one Halloween Offering tool and the inventory items to sacrifice. The selected inputs are permanently consumed."
      onOpenChange={props.onOpenChange}
    >
      <div class="space-y-4">
        <label class="grid gap-1 text-sm text-slate-300">
          Halloween Offering tool
          <select
            class="h-10 rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm text-slate-200"
            value={toolId()}
            onChange={(event) => {
              setToolId(event.currentTarget.value);
              setIngredientIds((current) => current.filter((id) => id !== event.currentTarget.value));
            }}
          >
            <option value="">Select a tool</option>
            <For each={tools()}>{(item) => <option value={item.assetId}>{item.name}</option>}</For>
          </select>
        </label>
        <section>
          <h3 class="mb-2 text-sm font-semibold text-slate-200">Items to offer ({ingredientIds().length})</h3>
          <div class="max-h-64 overflow-y-auto">
            <For each={ingredients()}>
              {(item) => {
                const selected = () => ingredientIds().includes(item.assetId);
                return (
                  <label class="flex cursor-pointer gap-2 border-b border-slate-800 py-2 text-sm">
                    <input type="checkbox" checked={selected()} onChange={() => toggleIngredient(item.assetId)} />
                    <span class="min-w-0"><span class="block truncate text-slate-200">{item.name}</span><span class="block truncate text-xs text-slate-500">{item.quality ?? item.type ?? "TF2 item"}</span></span>
                  </label>
                );
              }}
            </For>
          </div>
          <Show when={tools().length === 0}><p class="mt-2 text-xs text-amber-300">No Halloween Offering tool was detected in this inventory.</p></Show>
        </section>
        <Show when={!props.enabled}><Alert variant="warning">TF2 trade-up operations are disabled by their feature flag.</Alert></Show>
        <Show when={message()}><Alert variant="danger">{message()}</Alert></Show>
        <label class="flex gap-3 rounded-lg border border-rose-500/40 p-3 text-sm text-slate-300">
          <input type="checkbox" checked={acknowledged()} onChange={(event) => setAcknowledged(event.currentTarget.checked)} />
          I understand that the tool and selected items are permanently consumed.
        </label>
        <label class="block text-sm text-slate-300">Type <strong>OFFER</strong> to confirm.<Input value={typed()} onInput={(event) => setTyped(event.currentTarget.value)} /></label>
        <div class="flex justify-end gap-2"><Button variant="ghost" onClick={() => props.onOpenChange(false)}>Go back</Button><Button variant="danger" disabled={!canExecute()} onClick={execute}>{pending() ? "Submitting…" : "Submit offering"}</Button></div>
      </div>
    </Dialog>
  );
}
