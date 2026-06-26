import { createResource, For, Show } from "solid-js";
import type { HealthStatus, InventorySnapshot, OperationReceipt } from "@cs-inv-edit/contracts";

export interface AppBackendClient {
  health(): Promise<HealthStatus>;
  inventory(): Promise<InventorySnapshot>;
  submitOperation(type: string, input?: unknown): Promise<OperationReceipt>;
}

export interface AppProps {
  backend: AppBackendClient;
  platform: "desktop" | "web";
}

export function App(props: AppProps) {
  const [health] = createResource(() => props.backend.health());
  const [inventory, { refetch }] = createResource(() => props.backend.inventory());
  const [operation, { refetch: submitStorageStub }] = createResource(
    () => false,
    async () => props.backend.submitOperation("storage.moveToStorage")
  );

  return (
    <main class="min-h-screen bg-slate-100 text-slate-950 lg:grid lg:grid-cols-[260px_1fr]">
      <aside class="flex flex-col gap-7 bg-slate-900 p-6 text-white lg:min-h-screen">
        <div>
          <p class="text-xs font-semibold uppercase tracking-wide text-cyan-300">
            {props.platform === "desktop" ? "Desktop app" : "Web wrapper"}
          </p>
          <h1 class="mt-2 text-2xl font-semibold leading-tight">CS Inventory Control</h1>
        </div>

        <nav class="grid grid-cols-2 gap-2 lg:grid-cols-1">
          {["Inventory", "Storage", "Trade-ups", "Settings"].map((item) => (
            <button class="rounded-md border border-slate-700 px-3 py-2 text-left text-sm text-slate-200 hover:border-cyan-300 hover:text-white">
              {item}
            </button>
          ))}
        </nav>

        <div class="mt-auto flex items-center justify-between border-t border-slate-700 pt-4 text-sm">
          <span class="text-slate-300">Backend</span>
          <strong class="rounded-md bg-slate-800 px-2 py-1">
            <Show when={health()} fallback="offline">
              {(value) => value().status}
            </Show>
          </strong>
        </div>
      </aside>

      <section class="p-5 sm:p-7">
        <header class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 class="text-3xl font-semibold">Inventory</h2>
            <p class="mt-2 max-w-2xl text-sm text-slate-600">
              Shared Solid app surface backed by the local Go protocol service.
            </p>
          </div>
          <div class="flex flex-wrap gap-2">
            <button class="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm hover:border-slate-500" onClick={() => refetch()}>
              Refresh
            </button>
            <button class="rounded-md border border-cyan-700 bg-cyan-700 px-3 py-2 text-sm text-white hover:bg-cyan-800" onClick={() => submitStorageStub()}>
              Queue storage stub
            </button>
          </div>
        </header>

        <Show when={operation()}>
          {(receipt) => (
            <div class="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-950">
              Queued {receipt().type}: <span class="font-mono">{receipt().operationId}</span>
            </div>
          )}
        </Show>

        <div class="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <For each={inventory()?.items ?? []}>
            {(item) => (
              <article class="min-h-28 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <div class="flex items-start justify-between gap-3">
                  <strong class="text-base leading-snug">{item.name}</strong>
                  <span class="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-600">{item.kind}</span>
                </div>
                <dl class="mt-4 grid gap-1 text-sm text-slate-600">
                  <div class="flex justify-between gap-3">
                    <dt>ID</dt>
                    <dd class="truncate font-mono">{item.id}</dd>
                  </div>
                  <Show when={item.paintWear !== undefined}>
                    <div class="flex justify-between gap-3">
                      <dt>Wear</dt>
                      <dd>{item.paintWear}</dd>
                    </div>
                  </Show>
                  <Show when={item.storageCount !== undefined}>
                    <div class="flex justify-between gap-3">
                      <dt>Stored</dt>
                      <dd>{item.storageCount}</dd>
                    </div>
                  </Show>
                </dl>
              </article>
            )}
          </For>
        </div>
      </section>
    </main>
  );
}
