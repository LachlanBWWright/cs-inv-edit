import { createEffect, createMemo, createSignal, onMount } from "solid-js";
import type { OperationReceipt } from "@cs-inv-edit/contracts";
import { SegmentedControl } from "../../shared/ui/SegmentedControl.js";

import {
  tf2Classes as classes,
  tf2Slots as slots,
  supportsTF2Selection as supportsSelection,
  tf2ItemGroup as itemGroup,
  type TF2Item,
} from "./tf2-loadout-model.js";
import type { TF2FeaturesViewProps } from "./tf2-features-view-props.js";
import { TF2ItemBrowser } from "./tf2-item-browser.js";
import { TF2LoadoutSidebar } from "./tf2-loadout-sidebar.js";

export function TF2FeaturesView(props: TF2FeaturesViewProps) {
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
    () =>
      slots.find((entry) => entry.id === slotId()) ?? {
        id: 0,
        name: "Primary",
        keys: ["primary"],
        group: "Weapons" as const,
      },
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
        <TF2ItemBrowser
          inventoryReady={inventoryReady()}
          loading={props.loading}
          snapshotStatus={props.snapshot?.status}
          query={query()}
          selectedSlot={selectedSlot()}
          compatibleItems={compatibleItems()}
          compatibleGroups={compatibleGroups()}
          equippedItem={equippedItem()}
          cardMinimumWidth={cardMinimumWidth()}
          cardHeight={cardHeight()}
          compactMode={props.compactMode}
          onRefresh={props.onRefresh}
          onQueryChange={setQuery}
          onSelect={(item) => void selectItem(item)}
          mobileVisible={mobileView() === "items"}
          containerClass="lg:order-2 lg:block"
        />

        <TF2LoadoutSidebar
          selectedClass={selectedClass()}
          presetId={presetId()}
          classId={classId()}
          slotId={slotId()}
          receipt={receipt()}
          featuresStatus={props.features?.status}
          applicableSlots={applicableSlots()}
          onSelectPreset={(preset) => void selectPreset(preset)}
          onSelectClass={(nextClassId) => {
            setClassId(nextClassId);
            setSlotId(0);
          }}
          onSelectSlot={(nextSlotId) => {
            setSlotId(nextSlotId);
            setMobileView("items");
          }}
          equippedForSlot={equippedForSlot}
          mobileVisible={mobileView() === "loadout"}
        />
      </div>
    </div>
  );
}
