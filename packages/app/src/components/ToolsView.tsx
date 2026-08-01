import { createSignal, Show, type JSX } from "solid-js";
import type {
  ApplyStatTrakSwapRequest,
  ApplyStrangePartRequest,
  ApplyToolToBaseItemRequest,
  ApplyToolToItemRequest,
  OperationReceipt,
} from "@cs-inv-edit/contracts";
import { formatState } from "../lib/format.js";
import { appErrorMessage, fromAppPromise } from "../lib/result.js";
import { Button } from "./ui/Button.js";
import { Input } from "./ui/Input.js";
import { PageHeader } from "./ui/PageHeader.js";
import { Surface } from "./ui/Surface.js";

export interface ToolsViewProps {
  onApplyStatTrakSwap: (
    input: ApplyStatTrakSwapRequest,
  ) => Promise<OperationReceipt>;
  onApplyStrangePart: (
    input: ApplyStrangePartRequest,
  ) => Promise<OperationReceipt>;
  onApplyToolToItem: (
    input: ApplyToolToItemRequest,
  ) => Promise<OperationReceipt>;
  onApplyToolToBaseItem: (
    input: ApplyToolToBaseItemRequest,
  ) => Promise<OperationReceipt>;
}

function ToolSection(props: {
  title: string;
  description: string;
  children: JSX.Element | string | number | null | undefined;
}) {
  return (
    <Surface as="section" class="p-4">
      <h3 class="text-lg font-semibold text-slate-100">{props.title}</h3>
      <p class="mt-2 text-sm text-slate-400">{props.description}</p>
      <div class="mt-4 space-y-3 text-sm">{props.children}</div>
    </Surface>
  );
}

export function ToolsView(props: ToolsViewProps) {
  const [statTrakInput, setStatTrakInput] =
    createSignal<ApplyStatTrakSwapRequest>({
      toolItemId: "",
      item1ItemId: "",
      item2ItemId: "",
    });
  const [strangePartInput, setStrangePartInput] =
    createSignal<ApplyStrangePartRequest>({
      strangePartItemId: "",
      itemItemId: "",
    });
  const [toolToItemInput, setToolToItemInput] =
    createSignal<ApplyToolToItemRequest>({ toolItemId: "", subjectItemId: "" });
  const [toolToBaseInput, setToolToBaseInput] =
    createSignal<ApplyToolToBaseItemRequest>({
      toolItemId: "",
      baseitemDefIndex: 0,
    });
  const [status, setStatus] = createSignal("");
  const [pending, setPending] = createSignal(false);

  const run = async (execute: () => Promise<OperationReceipt>) => {
    setPending(true);
    await fromAppPromise(execute(), "Tool request failed").match(
      (receipt) => {
        setStatus(`${receipt.type}: ${formatState(receipt.state)}`);
      },
      (error) => setStatus(appErrorMessage(error, "Request failed")),
    );
    setPending(false);
  };

  return (
    <div class="space-y-5">
      <PageHeader
        title="Tools"
        description="Run StatTrak, strange-part, and generic tool-to-item/base-item operations."
      />
      <Show when={status()}>
        <div class="rounded-lg border border-slate-700 bg-slate-900 p-3 text-sm text-slate-200">
          {status()}
        </div>
      </Show>
      <div class="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ToolSection
          title="StatTrak swap"
          description="Swap the supplied inventory items using the selected tool item."
        >
          <Input
            placeholder="Tool item ID"
            value={statTrakInput().toolItemId}
            onInput={(event) =>
              setStatTrakInput((current) => ({
                ...current,
                toolItemId: event.currentTarget.value.trim(),
              }))
            }
          />
          <Input
            placeholder="Item 1 ID"
            value={statTrakInput().item1ItemId}
            onInput={(event) =>
              setStatTrakInput((current) => ({
                ...current,
                item1ItemId: event.currentTarget.value.trim(),
              }))
            }
          />
          <Input
            placeholder="Item 2 ID"
            value={statTrakInput().item2ItemId}
            onInput={(event) =>
              setStatTrakInput((current) => ({
                ...current,
                item2ItemId: event.currentTarget.value.trim(),
              }))
            }
          />
          <Button
            disabled={pending()}
            onClick={() =>
              run(() => props.onApplyStatTrakSwap(statTrakInput()))
            }
          >
            Submit swap
          </Button>
        </ToolSection>
        <ToolSection
          title="Apply strange part"
          description="Attach a strange part to a target item using the provided tool item."
        >
          <Input
            placeholder="Strange part item ID"
            value={strangePartInput().strangePartItemId}
            onInput={(event) =>
              setStrangePartInput((current) => ({
                ...current,
                strangePartItemId: event.currentTarget.value.trim(),
              }))
            }
          />
          <Input
            placeholder="Target item ID"
            value={strangePartInput().itemItemId}
            onInput={(event) =>
              setStrangePartInput((current) => ({
                ...current,
                itemItemId: event.currentTarget.value.trim(),
              }))
            }
          />
          <Button
            disabled={pending()}
            onClick={() =>
              run(() => props.onApplyStrangePart(strangePartInput()))
            }
          >
            Apply strange part
          </Button>
        </ToolSection>
        <ToolSection
          title="Apply tool to item"
          description="Apply a tool item against a specific inventory item."
        >
          <Input
            placeholder="Tool item ID"
            value={toolToItemInput().toolItemId}
            onInput={(event) =>
              setToolToItemInput((current) => ({
                ...current,
                toolItemId: event.currentTarget.value.trim(),
              }))
            }
          />
          <Input
            placeholder="Subject item ID"
            value={toolToItemInput().subjectItemId}
            onInput={(event) =>
              setToolToItemInput((current) => ({
                ...current,
                subjectItemId: event.currentTarget.value.trim(),
              }))
            }
          />
          <Button
            disabled={pending()}
            onClick={() =>
              run(() => props.onApplyToolToItem(toolToItemInput()))
            }
          >
            Apply to item
          </Button>
        </ToolSection>
        <ToolSection
          title="Apply tool to base item"
          description="Apply a tool item against a base item definition."
        >
          <Input
            placeholder="Tool item ID"
            value={toolToBaseInput().toolItemId}
            onInput={(event) =>
              setToolToBaseInput((current) => ({
                ...current,
                toolItemId: event.currentTarget.value.trim(),
              }))
            }
          />
          <Input
            placeholder="Base item defindex"
            type="number"
            value={toolToBaseInput().baseitemDefIndex}
            onInput={(event) =>
              setToolToBaseInput((current) => ({
                ...current,
                baseitemDefIndex: Number(event.currentTarget.value) || 0,
              }))
            }
          />
          <Button
            disabled={pending()}
            onClick={() =>
              run(() => props.onApplyToolToBaseItem(toolToBaseInput()))
            }
          >
            Apply to base
          </Button>
        </ToolSection>
      </div>
    </div>
  );
}
