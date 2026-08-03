import { createMemo, createSignal, For, Show } from "solid-js";
import { ResultAsync } from "neverthrow";
import type {
  EconomyInventoryItemDto,
  OperationReceipt,
} from "@cs-inv-edit/contracts";

type TF2Item = Extract<EconomyInventoryItemDto, { game: "tf2" }>;

const decalTargets = new Set([
  "flair!",
  "photo badge",
  "clan pride",
  "conscientious objector",
]);

function isDecalTool(item: TF2Item): boolean {
  const descriptor = `${item.name} ${item.details.toolType ?? ""}`.toLowerCase();
  return descriptor.includes("decal tool") || descriptor.includes("customize_texture");
}

function readPNGBase64(file: File): ResultAsync<string, Error> {
  return ResultAsync.fromPromise(
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error ?? new Error("Unable to read PNG"));
      reader.onabort = () => reject(new Error("PNG selection was cancelled"));
      reader.onload = () => {
        const value = reader.result;
        if (typeof value !== "string") {
          reject(new Error("PNG reader returned an unexpected result"));
          return;
        }
        const separator = value.indexOf(",");
        if (separator < 0) {
          reject(new Error("PNG data URL was malformed"));
          return;
        }
        resolve(value.slice(separator + 1));
      };
      reader.readAsDataURL(file);
    }),
    (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  );
}

export function TF2DecalTool(props: {
  target: TF2Item;
  items: TF2Item[];
  onOperation: (type: string, input: unknown) => Promise<OperationReceipt>;
}) {
  const tools = createMemo(() => props.items.filter(isDecalTool));
  const eligible = createMemo(() => decalTargets.has(props.target.name.toLowerCase()));
  const [toolItemId, setToolItemId] = createSignal("");
  const [pngBase64, setPNGBase64] = createSignal("");
  const [filename, setFilename] = createSignal("");
  const [status, setStatus] = createSignal("");
  const [confirming, setConfirming] = createSignal(false);

  const selectFile = (file: File | undefined) => {
    setPNGBase64("");
    setFilename("");
    setStatus("");
    if (!file) return;
    if (file.type !== "image/png") {
      setStatus("Choose a PNG file.");
      return;
    }
    if (file.size <= 0 || file.size >= 69_632) {
      setStatus("The final PNG must be smaller than 69,632 bytes.");
      return;
    }
    void readPNGBase64(file).match(
      (value) => {
        setPNGBase64(value);
        setFilename(file.name);
      },
      (error) => setStatus(error.message),
    );
  };

  const apply = async () => {
    setConfirming(false);
    setStatus("Uploading and applying decal…");
    const receipt = await props.onOperation("tf2.customization.decal-apply", {
      game: "tf2",
      toolItemId: toolItemId(),
      subjectItemId: props.target.assetId,
      pngBase64: pngBase64(),
      confirmed: true,
    });
    setStatus(receipt.message ?? receipt.state);
  };

  return (
    <Show when={eligible()}>
      <div class="rounded-lg border border-slate-800 bg-slate-950 p-3">
        <p class="text-sm font-medium text-slate-200">Apply custom decal</p>
        <div class="mt-3 grid gap-2">
          <label class="grid gap-1 text-xs text-slate-400">
            <span>Decal Tool</span>
            <select
              class="h-9 rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm text-slate-200"
              value={toolItemId()}
              onInput={(event) => setToolItemId(event.currentTarget.value)}
            >
              <option value="">Select an owned tool</option>
              <For each={tools()}>
                {(tool) => <option value={tool.assetId}>{tool.name} · {tool.assetId}</option>}
              </For>
            </select>
          </label>
          <label class="grid gap-1 text-xs text-slate-400">
            <span>Final 128×128 PNG</span>
            <input
              type="file"
              accept="image/png,.png"
              class="block w-full text-xs text-slate-300 file:mr-3 file:rounded file:border-0 file:bg-slate-800 file:px-3 file:py-2 file:text-slate-200"
              onChange={(event) => selectFile(event.currentTarget.files?.[0])}
            />
          </label>
          <Show when={filename()}>
            <p class="text-xs text-slate-500">Ready: {filename()}</p>
          </Show>
          <Show when={!confirming()}>
            <button
              type="button"
              disabled={!toolItemId() || !pngBase64()}
              class="rounded-lg border border-red-900 bg-red-950 px-3 py-2 text-sm text-red-100 disabled:cursor-not-allowed disabled:opacity-40"
              onClick={() => setConfirming(true)}
            >
              Apply decal…
            </button>
          </Show>
          <Show when={confirming()}>
            <div class="rounded-lg border border-red-900 p-3">
              <p class="text-xs text-slate-300">This permanently consumes the selected Decal Tool and changes {props.target.name}.</p>
              <div class="mt-2 flex gap-2">
                <button type="button" class="rounded bg-red-800 px-3 py-1.5 text-xs text-white" onClick={() => void apply()}>Confirm permanent change</button>
                <button type="button" class="rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-300" onClick={() => setConfirming(false)}>Cancel</button>
              </div>
            </div>
          </Show>
          <Show when={status()}><p class="text-xs text-slate-400">{status()}</p></Show>
        </div>
      </div>
    </Show>
  );
}
