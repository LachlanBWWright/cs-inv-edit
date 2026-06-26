import { For, Show, type Component } from "solid-js";
import type { FeatureSettings, InventoryItemDto, OperationReceipt } from "../lib/backend";

interface StickersViewProps {
  items: InventoryItemDto[];
  settings: FeatureSettings;
  dev: boolean;
  onSubmit(type: string, input?: unknown): Promise<OperationReceipt | null>;
}

export const StickersView: Component<StickersViewProps> = (props) => {
  const stickerItems = props.items.filter((item) => item.kind === "sticker_item");

  const submit = async (type: string) => {
    await props.onSubmit(type, { itemId: stickerItems[0]?.id ?? "" });
  };

  return (
    <div class="space-y-5">
      <div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 class="text-2xl font-semibold text-slate-900">Stickers</h2>
        <p class="mt-1 text-sm text-slate-600">Read-only surfaces first, with extraction and removal actions intentionally behind development warnings.</p>
      </div>

      <div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div class="flex items-center justify-between gap-3">
          <h3 class="text-lg font-semibold text-slate-900">Known stickers</h3>
          <Show when={props.dev}>
            <span class="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium uppercase tracking-wide text-amber-900">Requires live validation</span>
          </Show>
        </div>
        <div class="mt-4 space-y-3">
          <For each={stickerItems}>
            {(item) => (
              <div class="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div class="font-semibold text-slate-900">{item.name}</div>
                <div class="mt-1 text-xs font-mono text-slate-500">{item.id}</div>
              </div>
            )}
          </For>
        </div>
      </div>

      <div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 class="text-lg font-semibold text-slate-900">Actions</h3>
        <div class="mt-4 flex flex-wrap gap-2">
          <button class="rounded-lg border border-slate-300 px-3 py-2 text-sm" disabled={!props.settings.enableStickerExtract || !props.dev} onClick={() => void submit("stickers.extract")}>Extract sticker</button>
          <button class="rounded-lg border border-slate-300 px-3 py-2 text-sm" disabled={!props.settings.enableStickerRemove || !props.dev} onClick={() => void submit("stickers.remove")}>Remove sticker</button>
          <button class="rounded-lg border border-slate-300 px-3 py-2 text-sm" disabled={!props.settings.enableStickerApply || !props.dev} onClick={() => void submit("stickers.apply")}>Apply sticker</button>
        </div>
        <p class="mt-3 text-sm text-slate-600">Low-confidence sticker operations remain feature-flagged and should not be exposed as default production controls.</p>
      </div>
    </div>
  );
};
