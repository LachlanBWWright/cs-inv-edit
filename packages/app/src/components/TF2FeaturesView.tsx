import {
  createEffect,
  createMemo,
  createSignal,
  For,
  onMount,
  Show,
} from "solid-js";
import type {
  EconomyInventoryItemDto,
  GameInventorySnapshot,
  OperationReceipt,
  TF2FeatureSnapshot,
} from "@cs-inv-edit/contracts";
import demomanIcon from "../assets/images/tf2/classes/demoman.png";
import engineerIcon from "../assets/images/tf2/classes/engineer.png";
import heavyIcon from "../assets/images/tf2/classes/heavy.png";
import medicIcon from "../assets/images/tf2/classes/medic.png";
import pyroIcon from "../assets/images/tf2/classes/pyro.png";
import scoutIcon from "../assets/images/tf2/classes/scout.png";
import sniperIcon from "../assets/images/tf2/classes/sniper.png";
import soldierIcon from "../assets/images/tf2/classes/soldier.png";
import spyIcon from "../assets/images/tf2/classes/spy.png";
import { ItemPreviewMedia } from "./ItemPreviewMedia.js";
import { SegmentedControl } from "./ui/SegmentedControl.js";

type TF2Item = Extract<EconomyInventoryItemDto, { game: "tf2" }>;
type SlotGroup = "Weapons" | "Cosmetics" | "Class equipment" | "Taunts";

const classes = [
  { id: 1, name: "Scout", icon: scoutIcon },
  { id: 2, name: "Sniper", icon: sniperIcon },
  { id: 3, name: "Soldier", icon: soldierIcon },
  { id: 4, name: "Demoman", icon: demomanIcon },
  { id: 5, name: "Medic", icon: medicIcon },
  { id: 6, name: "Heavy", icon: heavyIcon },
  { id: 7, name: "Pyro", icon: pyroIcon },
  { id: 8, name: "Spy", icon: spyIcon },
  { id: 9, name: "Engineer", icon: engineerIcon },
] as const;

const slots = [
  { id: 0, name: "Primary", keys: ["primary"], group: "Weapons" },
  { id: 1, name: "Secondary", keys: ["secondary"], group: "Weapons" },
  { id: 2, name: "Melee", keys: ["melee"], group: "Weapons" },
  { id: 3, name: "Utility", keys: ["utility"], group: "Class equipment" },
  { id: 4, name: "Building", keys: ["building"], group: "Class equipment" },
  { id: 5, name: "PDA", keys: ["pda", "pda1"], group: "Class equipment" },
  { id: 6, name: "PDA 2", keys: ["pda2"], group: "Class equipment" },
  { id: 7, name: "Head", keys: ["head", "headgear"], group: "Cosmetics" },
  { id: 8, name: "Cosmetic", keys: ["misc"], group: "Cosmetics" },
  { id: 9, name: "Action", keys: ["action"], group: "Class equipment" },
  { id: 10, name: "Cosmetic 2", keys: ["misc2"], group: "Cosmetics" },
  ...Array.from({ length: 8 }, (_, index) => ({
    id: index + 11,
    name: `Taunt ${index + 1}`,
    keys: [index === 0 ? "taunt" : `taunt${index + 1}`],
    group: "Taunts" as const,
  })),
] satisfies { id: number; name: string; keys: string[]; group: SlotGroup }[];
const slotGroupNames: SlotGroup[] = [
  "Weapons",
  "Cosmetics",
  "Class equipment",
  "Taunts",
];

function supportsSelection(
  item: TF2Item,
  className: string,
  slotKeys: readonly string[],
) {
  const normalizedClass = className.toLowerCase();
  const usable =
    item.details.usableClasses?.map((value) => value.toLowerCase()) ?? [];
  if (
    usable.length > 0 &&
    !usable.includes(normalizedClass) &&
    !usable.includes("all_class")
  )
    return false;
  const configured =
    item.details.loadoutSlots?.[normalizedClass] ??
    item.details.loadoutSlots?.[className] ??
    item.details.equipSlot;
  return configured ? slotKeys.includes(configured.toLowerCase()) : false;
}

function itemGroup(item: TF2Item) {
  if (item.details.itemKind === "weapon") return "Weapons";
  if (item.details.itemKind === "cosmetic") return "Cosmetics";
  if (item.details.itemKind === "taunt") return "Taunts";
  return "Other";
}

export function TF2FeaturesView(props: {
  snapshot?: GameInventorySnapshot;
  features?: TF2FeatureSnapshot;
  loading: boolean;
  compactMode: "icons" | "concise" | "detailed";
  onRefresh: () => void;
  onOperation: (
    type: string,
    input: unknown,
    suppressToast?: boolean,
  ) => Promise<OperationReceipt>;
}) {
  const [classId, setClassId] = createSignal(1);
  const [presetId, setPresetId] = createSignal(0);
  const [slotId, setSlotId] = createSignal(0);
  const [query, setQuery] = createSignal("");
  const [receipt, setReceipt] = createSignal<OperationReceipt>();
  let requestedInitialRefresh = false;
  const items = createMemo(() =>
    props.snapshot?.game === "tf2" ? props.snapshot.items : [],
  );
  const inventoryReady = createMemo(
    () => props.snapshot?.game === "tf2" && props.snapshot.status === "ready",
  );
  const selectedClass = createMemo(
    () => classes.find((entry) => entry.id === classId()) ?? classes[0],
  );
  const selectedSlot = createMemo(
    () => slots.find((entry) => entry.id === slotId()) ?? slots[0],
  );
  const equippedForSlot = (id: number) => {
    const authoritative = props.features?.presetItems.find(
      (entry) =>
        entry.classId === classId() &&
        entry.presetId === presetId() &&
        entry.slotId === id,
    );
    if (authoritative) {
      return items().find((item) => item.assetId === authoritative.itemId);
    }
    return items().find((item) =>
      item.details.equippedStates?.some(
        (state) => state.class === classId() && state.slot === id,
      ),
    );
  };
  const equippedItem = createMemo(() => equippedForSlot(slotId()));
  const applicableSlots = createMemo(() =>
    slots.filter((slot) => {
      if (classId() === 8 && slot.id === 5) return false;
      if (classId() === 9 && (slot.id === 4 || slot.id === 6)) return false;
      if (
        slot.group === "Weapons" ||
        slot.group === "Cosmetics" ||
        slot.group === "Taunts" ||
        slot.id === 9
      )
        return true;
      if ((classId() === 8 || classId() === 9) && [4, 5, 6].includes(slot.id))
        return true;
      return items().some((item) =>
        supportsSelection(item, selectedClass().name, slot.keys),
      );
    }),
  );
  const compatibleItems = createMemo(() => {
    const needle = query().trim().toLowerCase();
    return items().filter(
      (item) =>
        supportsSelection(item, selectedClass().name, selectedSlot().keys) &&
        (!needle ||
          `${item.name} ${item.marketName ?? ""}`
            .toLowerCase()
            .includes(needle)),
    );
  });
  const compatibleGroups = createMemo(() =>
    ["Weapons", "Cosmetics", "Taunts", "Other"]
      .map((name) => ({
        name,
        items: compatibleItems().filter((item) => itemGroup(item) === name),
      }))
      .filter((group) => group.items.length),
  );
  const selectItem = async (item: TF2Item) => {
    if (!inventoryReady()) return;
    setReceipt(
      await props.onOperation(
        "tf2.loadout.set-preset-item",
        {
          game: "tf2",
          itemId: item.assetId,
          classId: classId(),
          presetId: presetId(),
          slotId: slotId(),
        },
        true,
      ),
    );
  };
  const selectPreset = async (next: number) => {
    if (!inventoryReady()) return;
    setPresetId(next);
    setReceipt(
      await props.onOperation(
        "tf2.loadout.select-preset",
        {
          game: "tf2",
          classId: classId(),
          presetId: next,
        },
        true,
      ),
    );
  };
  onMount(() => {
    if (
      requestedInitialRefresh ||
      props.loading ||
      (props.snapshot?.game === "tf2" && props.snapshot.status === "ready")
    )
      return;
    requestedInitialRefresh = true;
    props.onRefresh();
  });
  createEffect(() => {
    const active = props.features?.classPresets.find(
      (entry) => entry.classId === classId(),
    );
    if (active && active.activePresetId !== presetId()) {
      setPresetId(active.activePresetId);
    }
  });

  const cardMinimumWidth = () => (props.compactMode === "icons" ? 105 : 165);
  const cardHeight = () => (props.compactMode === "icons" ? 104 : 146);
  const [mobileView, setMobileView] = createSignal<"items" | "loadout">(
    "items",
  );

  return (
    <div class="flex min-h-0 flex-1 flex-col gap-3">
      <SegmentedControl
        class="shrink-0 lg:hidden"
        label="TF2 loadout view"
        value={mobileView()}
        onChange={setMobileView}
        options={[
          {
            value: "items",
            label: `${selectedSlot().name} items`,
          },
          {
            value: "loadout",
            label: `${selectedClass().name} loadout`,
          },
        ]}
      />
      <div class="grid flex-1 items-start gap-4 lg:grid-cols-[minmax(320px,0.95fr)_minmax(0,1fr)]">
        <section
          class={`${
            mobileView() === "items" ? "block" : "hidden"
          } lg:order-2 lg:block`}
        >
          <div class="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 bg-slate-950 pb-3">
            <div>
              <h2 class="font-semibold text-slate-100">
                {selectedSlot().name}
              </h2>
              <p class="text-xs text-slate-500">
                {compatibleItems().length} compatible owned items
                {equippedItem() ? ` · ${equippedItem()?.name} equipped` : ""}
              </p>
            </div>
            <input
              class="h-9 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 sm:w-64"
              placeholder="Filter items"
              value={query()}
              onInput={(event) => setQuery(event.currentTarget.value)}
            />
          </div>
          <Show
            when={!props.loading && inventoryReady()}
            fallback={
              <p class="py-12 text-center text-sm text-slate-500">
                Loading your TF2 inventory…
              </p>
            }
          >
            <Show
              when={compatibleItems().length}
              fallback={
                <div class="py-12 text-center">
                  <p class="text-sm text-slate-500">
                    No owned items match this class and slot.
                  </p>
                  <Show
                    when={!props.snapshot || props.snapshot.status !== "ready"}
                  >
                    <button
                      class="mt-3 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300"
                      onClick={props.onRefresh}
                    >
                      Load TF2 inventory
                    </button>
                  </Show>
                </div>
              }
            >
              <div class="space-y-5 pt-4">
                <For each={compatibleGroups()}>
                  {(group) => (
                    <section>
                      <h3 class="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                        {group.name}
                      </h3>
                      <div
                        class="grid gap-3"
                        style={{
                          "grid-template-columns": `repeat(auto-fill, minmax(${cardMinimumWidth()}px, 1fr))`,
                        }}
                      >
                        <For each={group.items}>
                          {(item) => (
                            <button
                              style={{
                                height: `${cardHeight()}px`,
                                contain: "layout paint style",
                              }}
                              class={`inventory-item-card group relative flex cursor-pointer flex-col overflow-hidden rounded-2xl border-2 bg-slate-950 p-3 text-left transition focus:outline-none ${equippedItem()?.assetId === item.assetId ? "border-slate-400 bg-slate-900" : "border-slate-800 hover:border-slate-600"}`}
                              onClick={() => void selectItem(item)}
                            >
                              <ItemPreviewMedia
                                name={item.name}
                                imageUrl={item.imageUrl}
                                variant="economy-card"
                              />
                              <Show when={props.compactMode !== "icons"}>
                                <p class="mt-2 line-clamp-2 text-sm font-medium text-slate-100">
                                  {item.name}
                                </p>
                              </Show>
                              <Show
                                when={
                                  equippedItem()?.assetId === item.assetId &&
                                  props.compactMode !== "icons"
                                }
                              >
                                <p class="mt-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                                  Equipped
                                </p>
                              </Show>
                            </button>
                          )}
                        </For>
                      </div>
                    </section>
                  )}
                </For>
              </div>
            </Show>
          </Show>
        </section>

        <aside
          class={`rounded-2xl border border-slate-800 bg-slate-950 p-4 ${
            mobileView() === "loadout" ? "block" : "hidden"
          } lg:sticky lg:top-20 lg:order-1 lg:block lg:max-h-[calc(100vh-6rem)] lg:self-start lg:overflow-y-auto`}
        >
          <div class="flex items-center justify-between gap-3">
            <div>
              <h2 class="text-xl font-semibold text-slate-100">
                {selectedClass().name}
              </h2>
              <p class="text-xs text-slate-500">
                Loadout preset {presetId() + 1}
              </p>
            </div>
            <div class="flex gap-1">
              <For each={[0, 1, 2, 3]}>
                {(preset) => (
                  <button
                    class={`h-9 min-w-9 rounded-lg border px-3 text-sm ${presetId() === preset ? "border-slate-500 bg-slate-700 text-white" : "border-slate-700 text-slate-400 hover:bg-slate-800"}`}
                    onClick={() => void selectPreset(preset)}
                  >
                    {preset + 1}
                  </button>
                )}
              </For>
            </div>
          </div>
          <div class="mt-4 grid grid-cols-9 gap-1">
            <For each={classes}>
              {(entry) => (
                <button
                  class={`aspect-square min-w-0 overflow-hidden rounded-lg p-1 ${classId() === entry.id ? "bg-slate-700 ring-1 ring-inset ring-slate-400" : "opacity-70 hover:bg-slate-800 hover:opacity-100"}`}
                  aria-label={entry.name}
                  title={entry.name}
                  onClick={() => {
                    setClassId(entry.id);
                    setSlotId(0);
                  }}
                >
                  <img
                    class="h-full w-full object-contain"
                    src={entry.icon}
                    alt=""
                  />
                </button>
              )}
            </For>
          </div>
          <div class="mt-5 space-y-4">
            <For each={slotGroupNames}>
              {(groupName) => (
                <Show
                  when={applicableSlots().some(
                    (slot) => slot.group === groupName,
                  )}
                >
                  <section>
                    <h3 class="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                      {groupName}
                    </h3>
                    <div class="grid grid-cols-2 gap-2">
                      <For
                        each={applicableSlots().filter(
                          (slot) => slot.group === groupName,
                        )}
                      >
                        {(slot) => {
                          const equipped = () => equippedForSlot(slot.id);
                          return (
                            <button
                              class={`min-h-20 rounded-lg border p-2 text-left ${slotId() === slot.id ? "border-slate-400 bg-slate-800" : "border-slate-800 bg-slate-950 hover:border-slate-700"}`}
                              onClick={() => {
                                setSlotId(slot.id);
                                setMobileView("items");
                              }}
                            >
                              <span class="block text-xs font-semibold text-slate-400">
                                {slot.name}
                              </span>
                              <Show
                                when={equipped()}
                                fallback={
                                  <span class="mt-2 block text-xs text-slate-600">
                                    Empty
                                  </span>
                                }
                              >
                                {(item) => (
                                  <span class="mt-2 flex items-center gap-2">
                                    <span class="h-9 w-9 shrink-0">
                                      <ItemPreviewMedia
                                        name={item().name}
                                        imageUrl={item().imageUrl}
                                        variant="loadout-slot"
                                      />
                                    </span>
                                    <span class="line-clamp-2 text-xs text-slate-200">
                                      {item().name}
                                    </span>
                                  </span>
                                )}
                              </Show>
                            </button>
                          );
                        }}
                      </For>
                    </div>
                  </section>
                </Show>
              )}
            </For>
          </div>
          <Show when={receipt()}>
            {(value) => (
              <div class="mt-4 border-t border-slate-800 pt-3 text-sm">
                <span class="font-medium text-slate-200">{value().state}</span>
                <span class="ml-2 text-slate-400">{value().message}</span>
              </div>
            )}
          </Show>
          <Show when={props.features?.status === "waiting"}>
            <p class="mt-4 text-xs text-slate-500">
              Waiting for the TF2 Game Coordinator to publish loadout state.
            </p>
          </Show>
        </aside>
      </div>
    </div>
  );
}
