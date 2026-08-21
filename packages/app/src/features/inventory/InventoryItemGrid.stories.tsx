import type { Meta, StoryObj } from "storybook-solidjs-vite";
import type { InventoryItemDto } from "@cs-inv-edit/contracts";
import { InventoryItemGrid, createInventorySummary } from "./inventory-view-grid-parts.js";

const items: InventoryItemDto[] = [
  {
    id: "730-1",
    name: "AK-47 | Slate",
    marketName: "AK-47 | Slate (Field-Tested)",
    marketPrice: "$4.18",
    kind: "weapon_skin",
    rarity: "Restricted",
    exterior: "Field-Tested",
    collection: "The Snakebite Collection",
    paintWear: 0.213_487,
    paintWearMin: 0,
    paintWearMax: 1,
    tradable: true,
    marketable: true,
  },
  {
    id: "730-2",
    name: "M4A1-S | Decimator",
    customName: "Quiet confidence",
    marketName: "StatTrak™ M4A1-S | Decimator (Minimal Wear)",
    marketPrice: "$42.67",
    kind: "weapon_skin",
    rarity: "Classified",
    exterior: "Minimal Wear",
    collection: "The Spectrum Collection",
    paintWear: 0.091_204,
    paintWearMin: 0,
    paintWearMax: 0.85,
    isStatTrak: true,
    tradable: false,
    marketable: true,
    tradableAfter: "2026-08-20T00:00:00Z",
  },
  {
    id: "730-3",
    name: "Kilowatt Case",
    marketName: "Kilowatt Case",
    marketPrice: "$0.37",
    kind: "container",
    rarity: "Base Grade",
    requiredKeyDefIndexes: [4001],
    tradable: true,
    marketable: true,
  },
  {
    id: "730-4",
    name: "Storage Unit",
    customName: "Trade-up candidates",
    kind: "storage_unit",
    rarity: "Base Grade",
    storageCount: 417,
    storageEligible: false,
  },
  {
    id: "730-5",
    name: "Name Tag",
    marketName: "Name Tag",
    marketPrice: "$1.99",
    kind: "tool_item",
    rarity: "Base Grade",
    toolType: "name_tag",
    isNameTagTool: true,
    tradable: true,
    marketable: true,
  },
  {
    id: "730-6",
    name: "Sticker | Crown (Foil)",
    marketName: "Sticker | Crown (Foil)",
    marketPrice: "$612.43",
    kind: "sticker_item",
    rarity: "Exotic",
    tradable: true,
    marketable: true,
  },
];

const meta = {
  title: "Inventory/Item Grid",
  component: InventoryItemGrid,
  parameters: {
    docs: {
      description: {
        component: "The production CS2 inventory grid rendered with deterministic mock data.",
      },
    },
  },
} satisfies Meta<typeof InventoryItemGrid>;

export default meta;
type Story = StoryObj<typeof meta>;

const noOp = () => undefined;

export const MockInventory: Story = {
  args: {
    filteredItems: items,
    itemCardClass: () =>
      "inventory-item-card rarity-outline relative flex flex-col overflow-hidden rounded-2xl border-2 bg-slate-950 text-left",
    compactLayout: "flex flex-1 flex-col px-3 py-3",
    compactSummary: (item) => createInventorySummary(item, "comfortable"),
    onSelectItem: noOp,
    storageSelectionActive: false,
    storageSelectedItemIds: [],
    marketPrices: new Map([
      ["AK-47 | Slate (Field-Tested)", 418],
      ["StatTrak™ M4A1-S | Decimator (Minimal Wear)", 4_267],
      ["Kilowatt Case", 37],
      ["Name Tag", 199],
      ["Sticker | Crown (Foil)", 61_243],
    ]),
    onPointerUp: noOp,
    onPointerLeave: noOp,
    onItemPointerDown: noOp,
    onItemPointerEnter: noOp,
  },
  render: (args) => (
    <section class="mx-auto max-w-7xl">
      <header class="mb-5">
        <p class="text-sm font-medium text-cyan-300">Mock account</p>
        <h1 class="text-2xl font-semibold">CS2 inventory</h1>
        <p class="mt-1 text-sm text-slate-400">Six representative item states</p>
      </header>
      <InventoryItemGrid {...args} />
    </section>
  ),
};
