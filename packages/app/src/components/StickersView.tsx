import { createSignal, For, Show } from "solid-js";
import type {
  InventorySnapshot,
  OperationReceipt,
} from "@cs-inv-edit/contracts";
import { formatState } from "../lib/format.js";
import { appErrorMessage, fromAppPromise } from "../lib/result.js";
import { Alert } from "./ui/Alert.js";
import { Button } from "./ui/Button.js";
import { PageHeader } from "./ui/PageHeader.js";
import { Surface } from "./ui/Surface.js";

export interface StickersViewProps {
  inventory: InventorySnapshot | undefined;
  onSubmit: (type: string, input?: unknown) => Promise<OperationReceipt>;
}

export function StickersView(props: StickersViewProps) {
  const [status, setStatus] = createSignal<string>("");
  const stickerItems = () =>
    (props.inventory?.items ?? []).filter(
      (item) => item.kind === "sticker_item",
    );

  const runOperation = async (type: string) => {
    await fromAppPromise(
      props.onSubmit(type, { itemId: stickerItems()[0]?.id }),
      "Sticker request failed",
    ).match(
      (receipt) => {
        setStatus(`${receipt.type}: ${formatState(receipt.state)}`);
      },
      (error) => setStatus(appErrorMessage(error, "Request failed")),
    );
  };

  return (
    <div class="space-y-5">
      <PageHeader
        title="Stickers"
        description="Read-only sticker display with extraction gated behind live validation."
      />

      <Alert variant="warning">
        <p class="font-semibold">Requires live validation</p>
        <p class="mt-1">
          Sticker extraction remains development-only and must not be treated as
          production-ready.
        </p>
      </Alert>

      <Show when={status()}>
        <div class="rounded-lg border border-slate-700 bg-slate-900/80 p-3 text-sm text-slate-200">
          {status()}
        </div>
      </Show>

      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <For each={stickerItems()}>
          {(item) => (
            <Surface as="article" class="p-4">
              <h3 class="font-semibold text-slate-100">{item.name}</h3>
              <p class="mt-2 text-sm text-slate-400">
                Read-only preview for sticker assets.
              </p>
              <div class="mt-4 flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  onClick={() => runOperation("stickers.extract")}
                >
                  Extract
                </Button>
              </div>
            </Surface>
          )}
        </For>
      </div>
    </div>
  );
}
