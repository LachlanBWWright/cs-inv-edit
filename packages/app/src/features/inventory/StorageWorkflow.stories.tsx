import type { InventoryItemDto, InventorySnapshot } from "@cs-inv-edit/contracts";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { InventoryGrid } from "./inventory-view-content-grid.js";

const unit: InventoryItemDto = {
  id: "9001",
  name: "Storage Unit",
  customName: "Trade-up candidates",
  kind: "storage_unit",
  storageCount: 417,
  storageEligible: false,
};

const availableItems: InventoryItemDto[] = [
  {
    id: "1001",
    name: "AK-47 | Slate",
    kind: "weapon_skin",
    exterior: "Field-Tested",
    rarity: "Restricted",
    paintWear: 0.21,
    storageEligible: true,
  },
  {
    id: "1002",
    name: "M4A1-S | Decimator",
    kind: "weapon_skin",
    exterior: "Minimal Wear",
    rarity: "Classified",
    paintWear: 0.09,
    storageEligible: true,
  },
  {
    id: "1003",
    name: "Kilowatt Case",
    kind: "container",
    rarity: "Base Grade",
    storageEligible: true,
  },
];

const storedItems = availableItems.map((item) => ({
  ...item,
  casketId: unit.id,
  storageLocation: "Trade-up candidates",
  storageEligible: false,
}));

const inventory: InventorySnapshot = {
  items: [unit, ...availableItems],
  refreshedAt: "2026-08-13T00:00:00Z",
  status: "ready",
};

const noOp = () => undefined;
const baseArgs = {
  inventory,
  inventoryLoading: false,
  selectionMode: "inventory" as const,
  selectedItem: undefined,
  selectedItemExplicit: false,
  selectedItemIds: [],
  compactMode: "concise" as const,
  marketPrices: new Map<string, number>(),
  onSelectItem: noOp,
  onRefresh: noOp,
  detailsPanel: <div />,
  alerts: <div />,
  browsingStorageUnit: undefined,
  movingIntoStorageUnit: undefined,
  removeFromStorageMode: false,
  storageSelectedItemIds: [],
  storageRetrieval: undefined,
  storageFailures: [],
  storageMutationsEnabled: true,
  storageUnavailableReason: undefined,
  onBackFromStorage: noOp,
  onToggleRemoveFromStorageMode: noOp,
  onRetrieveFromStorage: noOp,
  onRetrieveAllFromStorage: noOp,
  onCancelMoveIntoStorage: noOp,
  onConfirmMoveIntoStorage: noOp,
};

const meta = {
  title: "Inventory/Storage Workflow",
  component: InventoryGrid,
} satisfies Meta<typeof InventoryGrid>;

export default meta;
type Story = StoryObj<typeof meta>;

export const MoveIntoSelection: Story = {
  args: {
    ...baseArgs,
    filteredItems: availableItems,
    movingIntoStorageUnit: unit,
    storageSelectedItemIds: ["1001", "1002"],
  },
};

export const RemoveSelection: Story = {
  args: {
    ...baseArgs,
    inventory: { ...inventory, items: [unit, ...storedItems] },
    filteredItems: storedItems,
    browsingStorageUnit: unit,
    removeFromStorageMode: true,
    storageSelectedItemIds: ["1001", "1003"],
  },
};

export const RetrievalProgress: Story = {
  args: {
    ...baseArgs,
    inventory: { ...inventory, items: [unit, ...storedItems] },
    filteredItems: storedItems,
    browsingStorageUnit: unit,
    removeFromStorageMode: true,
    storageRetrieval: { completed: 1, total: 3 },
  },
};

export const PartialFailureRetry: Story = {
  args: {
    ...baseArgs,
    inventory: { ...inventory, items: [unit, ...storedItems] },
    filteredItems: storedItems,
    browsingStorageUnit: unit,
    removeFromStorageMode: true,
    storageSelectedItemIds: ["1002"],
    storageFailures: [
      { itemId: "1002", message: "CS2 did not confirm the storage change." },
    ],
  },
};

export const MutationsDisabled: Story = {
  args: {
    ...baseArgs,
    inventory: { ...inventory, items: [unit, ...storedItems] },
    filteredItems: storedItems,
    browsingStorageUnit: unit,
    storageMutationsEnabled: false,
    storageUnavailableReason: "Storage mutations are disabled in Settings.",
  },
};
