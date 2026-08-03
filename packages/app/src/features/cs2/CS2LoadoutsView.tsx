import {
  For,
  Show,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
} from "solid-js";
import type {
  CS2FeatureSnapshot,
  FeatureFlags,
  InventoryItemDto,
  InventorySnapshot,
  OperationReceipt,
} from "@cs-inv-edit/contracts";
import { ItemPreviewMedia } from "../inventory/ItemPreviewMedia.js";
import { SegmentedControl } from "../../shared/ui/SegmentedControl.js";

type EquipSlot = CS2FeatureSnapshot["equipSlots"][number];

const teamName = (classId: number) =>
  classId === 2
    ? "Terrorists"
    : classId === 3
      ? "Counter-Terrorists"
      : `Team ${classId}`;

export function CS2LoadoutsView(props: {
  features?: CS2FeatureSnapshot;
  inventory?: InventorySnapshot;
  featureFlags?: FeatureFlags;
  onRefresh: () => Promise<boolean>;
  onOperation: (
    type: string,
    input: unknown,
    suppressToast?: boolean,
  ) => Promise<OperationReceipt>;
}) {
  const slots = createMemo(() => props.features?.equipSlots ?? []);
  const teams = createMemo(() => [
    ...new Set(slots().map((slot) => slot.classId)),
  ]);
  const [classId, setClassId] = createSignal(2);
  const [slotId, setSlotId] = createSignal<number>();
  const [mobileView, setMobileView] = createSignal<"items" | "slots">("slots");
  const [loadingItemId, setLoadingItemId] = createSignal("");
  const [initializing, setInitializing] = createSignal(false);
  const [status, setStatus] = createSignal("");
  const teamSlots = createMemo(() =>
    slots()
      .filter((slot) => slot.classId === classId())
      .sort((left, right) => left.slotId - right.slotId),
  );
  const selectedSlot = createMemo(
    () =>
      teamSlots().find((slot) => slot.slotId === slotId()) ?? teamSlots()[0],
  );
  const ownedItems = createMemo(() => props.inventory?.items ?? []);
  const itemForSlot = (slot: EquipSlot) =>
    ownedItems().find((item) => item.id === slot.itemId) ??
    ownedItems().find((item) => item.defindex === slot.definitionId);
  const compatibleItems = createMemo(() => {
    const definitionId = selectedSlot()?.definitionId;
    return definitionId
      ? ownedItems().filter((item) => item.defindex === definitionId)
      : [];
  });
  const slotName = (slot: EquipSlot) =>
    itemForSlot(slot)?.name ?? `Equipment slot ${slot.slotId}`;
  const selectedSlotName = () => {
    const slot = selectedSlot();
    return slot ? slotName(slot) : "Compatible";
  };
  const isEquipped = (item: InventoryItemDto) =>
    selectedSlot()?.itemId === item.id;

  createEffect(() => {
    const availableTeams = teams();
    if (availableTeams.length && !availableTeams.includes(classId())) {
      setClassId(availableTeams[0]);
    }
  });
  let requestedInitialRefresh = false;
  createEffect(() => {
    if (slots().length || requestedInitialRefresh) return;
    requestedInitialRefresh = true;
    setInitializing(true);
    void props.onRefresh().then(() => setInitializing(false));
  });
  onMount(() => {
    const retry = globalThis.setInterval(() => {
      if (slots().length || initializing()) return;
      setInitializing(true);
      void props.onRefresh().then(() => setInitializing(false));
    }, 5000);
    onCleanup(() => globalThis.clearInterval(retry));
  });
  createEffect(() => {
    const availableSlots = teamSlots();
    if (
      availableSlots.length &&
      !availableSlots.some((slot) => slot.slotId === slotId())
    ) {
      setSlotId(availableSlots[0].slotId);
    }
  });

  const equip = async (item: InventoryItemDto) => {
    const slot = selectedSlot();
    if (!slot || isEquipped(item)) return;
    setLoadingItemId(item.id);
    setStatus("");
    const receipt = await props.onOperation(
      "cs2.loadout.set",
      {
        game: "cs2",
        itemId: item.id,
        classId: slot.classId,
        slotId: slot.slotId,
      },
      true,
    );
    setLoadingItemId("");
    setStatus(receipt.message || receipt.state);
  };

  return (
    <section class="flex min-h-0 flex-1 flex-col gap-3">
      <div class="flex shrink-0 flex-wrap gap-2">
        <For each={teams()}>
          {(team) => (
            <button
              class={`rounded-lg border px-3 py-2 text-sm ${classId() === team ? "border-cyan-400/40 bg-cyan-950 text-cyan-100" : "border-slate-700 bg-slate-900 text-slate-300"}`}
              onClick={() => {
                setClassId(team);
                setSlotId(undefined);
              }}
            >
              {teamName(team)}
            </button>
          )}
        </For>
      </div>
      <SegmentedControl
        class="shrink-0 lg:hidden"
        label="CS2 loadout view"
        value={mobileView()}
        onChange={setMobileView}
        options={[
          {
            value: "items",
            label: `${selectedSlotName()} items`,
          },
          { value: "slots", label: `${teamName(classId())} slots` },
        ]}
      />
      <div class="grid flex-1 items-start gap-4 lg:grid-cols-[minmax(320px,0.8fr)_minmax(0,1fr)]">
        <section
          class={`${mobileView() === "items" ? "block" : "hidden"} lg:order-2 lg:block`}
        >
          <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            <For each={compatibleItems()}>
              {(item) => (
                <button
                  disabled={
                    props.featureFlags?.enableCs2Loadouts !== true ||
                    !!loadingItemId() ||
                    isEquipped(item)
                  }
                  class={`relative min-h-36 rounded-xl border p-3 text-left disabled:cursor-default ${isEquipped(item) ? "border-cyan-400/40 bg-cyan-950" : "border-slate-800 bg-slate-900 hover:border-slate-600"}`}
                  onClick={() => void equip(item)}
                >
                  <ItemPreviewMedia
                    name={item.name}
                    imageUrl={item.imageUrl}
                    variant="loadout-slot"
                  />
                  <p class="mt-2 line-clamp-2 text-sm font-medium text-slate-100">
                    {item.name}
                  </p>
                  <p class="mt-1 text-xs text-slate-500">
                    {loadingItemId() === item.id
                      ? "Equipping…"
                      : isEquipped(item)
                        ? "Equipped"
                        : "Equip"}
                  </p>
                </button>
              )}
            </For>
          </div>
          <Show when={!compatibleItems().length}>
            <p class="py-12 text-center text-sm text-slate-500">
              No compatible owned items were found for this slot.
            </p>
          </Show>
        </section>
        <aside
          class={`rounded-xl border border-slate-800 bg-slate-900 p-3 ${mobileView() === "slots" ? "block" : "hidden"} lg:sticky lg:top-20 lg:order-1 lg:block lg:max-h-[calc(100vh-6rem)] lg:self-start lg:overflow-y-auto`}
        >
          <h2 class="border-b border-slate-800 bg-slate-900 pb-3 text-sm font-semibold text-slate-200">
            {teamName(classId())} slots
          </h2>
          <div class="mt-3 grid gap-2">
            <For each={teamSlots()}>
              {(slot) => {
                const equipped = () => itemForSlot(slot);
                return (
                  <button
                    class={`flex min-h-20 items-center gap-3 rounded-lg border p-2 text-left ${selectedSlot()?.slotId === slot.slotId ? "border-cyan-400/40 bg-cyan-950" : "border-slate-800 bg-slate-950 hover:border-slate-700"}`}
                    onClick={() => {
                      setSlotId(slot.slotId);
                      setMobileView("items");
                    }}
                  >
                    <div class="h-14 w-16 shrink-0 overflow-hidden rounded bg-slate-900">
                      <Show when={equipped()}>
                        {(item) => (
                          <ItemPreviewMedia
                            name={item().name}
                            imageUrl={item().imageUrl}
                            variant="loadout-slot"
                          />
                        )}
                      </Show>
                    </div>
                    <span class="min-w-0">
                      <span class="block truncate text-sm font-medium text-slate-100">
                        {slotName(slot)}
                      </span>
                      <span class="block text-xs text-slate-500">
                        Slot {slot.slotId}
                      </span>
                    </span>
                  </button>
                );
              }}
            </For>
          </div>
          <Show when={!teamSlots().length}>
            <div class="grid min-h-48 place-items-center px-4 text-center">
              <div>
                <p class="text-sm font-medium text-slate-200">
                  {initializing()
                    ? "Loading CS2 Game Coordinator loadout…"
                    : "No equipped slots were published"}
                </p>
                <p class="mt-1 text-xs text-slate-500">
                  {initializing()
                    ? "Slots will appear automatically when the authoritative inventory is ready."
                    : "Waiting for the Game Coordinator to publish the current team loadout…"}
                </p>
              </div>
            </div>
          </Show>
        </aside>
      </div>
      <Show when={props.featureFlags?.enableCs2Loadouts !== true}>
        <p class="shrink-0 text-xs text-amber-400">
          Loadout changes are disabled in feature settings.
        </p>
      </Show>
      <Show when={status()}>
        <p class="shrink-0 text-xs text-slate-500">{status()}</p>
      </Show>
    </section>
  );
}
