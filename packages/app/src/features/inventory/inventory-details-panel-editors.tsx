import { For, Show } from "solid-js";
import type { InventoryItemDto } from "@cs-inv-edit/contracts";
import { Button } from "../../shared/ui/Button.js";
import { Input } from "../../shared/ui/Input.js";
import { Select } from "../../shared/ui/Select.js";

export interface RenameEditorProps {
  selected: InventoryItemDto;
  renameOpen: boolean;
  draftName: string;
  nameTagTools: InventoryItemDto[];
  pending: boolean;
  selectedToolId: string;
  onRenameSubmit: () => Promise<void> | void;
  onCloseRename: () => void;
  onDraftNameChange: (value: string) => void;
  onSelectedToolChange: (value: string) => void;
}

function NameTagToolSelect(props: {
  nameTagTools: InventoryItemDto[];
  selectedToolId: string;
  onSelectedToolChange: (value: string) => void;
}) {
  if (props.nameTagTools.length === 0) {
    return (
      <p class="mt-3 text-xs text-slate-500">
        No compatible name tag tools are available in the current inventory.
      </p>
    );
  }

  return (
    <>
      <label class="mt-3 block font-medium text-slate-100">Name tag tool</label>
      <Select
        class="mt-2 w-full"
        value={props.selectedToolId}
        onChange={(event) =>
          props.onSelectedToolChange(event.currentTarget.value)
        }
      >
        <For each={props.nameTagTools}>
          {(tool) => <option value={tool.id}>{tool.name}</option>}
        </For>
      </Select>
    </>
  );
}

export function RenameEditor(props: RenameEditorProps) {
  return (
    <Show when={props.renameOpen}>
      <div class="rounded-2xl border border-slate-800/80 bg-slate-900 p-4 text-sm text-slate-300">
        <label class="block font-medium text-slate-100">Custom name</label>
        <Input
          class="mt-2"
          value={props.draftName}
          onInput={(event) =>
            props.onDraftNameChange(
              (event.currentTarget as HTMLInputElement | null)?.value ?? "",
            )
          }
        />
        <NameTagToolSelect
          nameTagTools={props.nameTagTools}
          selectedToolId={props.selectedToolId}
          onSelectedToolChange={props.onSelectedToolChange}
        />
        <div class="mt-4 flex flex-wrap gap-2">
          <Button
            onClick={() => void props.onRenameSubmit()}
            disabled={props.pending}
          >
            Apply
          </Button>
          <Button
            variant="secondary"
            onClick={() => props.onCloseRename()}
            disabled={props.pending}
          >
            Cancel
          </Button>
        </div>
      </div>
    </Show>
  );
}
