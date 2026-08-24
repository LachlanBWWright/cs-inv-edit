import type { Meta, StoryObj } from "storybook-solidjs-vite";
import type {
  EconomyInventoryItemDto,
  OperationReceipt,
} from "@cs-inv-edit/contracts";
import { TF2CraftingToolbar } from "./TF2CraftingToolbar.js";
import { TF2HalloweenOfferingDialog } from "./TF2HalloweenOfferingDialog.js";
import { TF2TradeUpConfirmationDialog } from "./TF2TradeUpConfirmationDialog.js";
import type { TF2TradeUpOutcome } from "./tf2-trade-up.js";

type TF2Item = Extract<EconomyInventoryItemDto, { game: "tf2" }>;

const details = (overrides: Partial<TF2Item["details"]> = {}): TF2Item["details"] => ({
  game: "tf2",
  level: 1,
  qualityId: 4,
  inventoryPosition: 1,
  originId: 0,
  style: 0,
  flags: 0,
  attributes: {},
  schemaQuality: "Unique",
  itemKind: "weapon",
  craftMaterialType: "weapon",
  craftClass: "weapon",
  collection: "Mock Scream Fortress Collection",
  rarity: "mercenary",
  tradeUpItems: [
    { defIndex: 501, name: "Mock Rocket Launcher", collection: "Mock Scream Fortress Collection", rarity: "commando", poolKind: "primary" },
    { defIndex: 502, name: "Mock Shotgun", collection: "Mock Scream Fortress Collection", rarity: "commando", poolKind: "primary" },
  ],
  ...overrides,
});

const item = (assetId: string, name: string, overrides: Partial<TF2Item["details"]> = {}): TF2Item => ({
  game: "tf2",
  appId: 440,
  assetId,
  name,
  quantity: 1,
  tradable: true,
  marketable: true,
  tags: [],
  details: details(overrides),
});

const inputs = Array.from({ length: 10 }, (_, index) => item(String(1000 + index), `Mock Weapon ${index + 1}`));
const outcomes: TF2TradeUpOutcome[] = [
  { defIndex: 501, name: "Mock Rocket Launcher", collection: "Mock Scream Fortress Collection", rarity: "commando", poolKind: "primary", probability: 0.5, collectionProbability: 1 },
  { defIndex: 502, name: "Mock Shotgun", collection: "Mock Scream Fortress Collection", rarity: "commando", poolKind: "primary", probability: 0.5, collectionProbability: 1 },
];

const noOp = () => undefined;
const noReceipt = async (): Promise<OperationReceipt | undefined> => undefined;
const noPriceScan = async () => undefined;
const toolbarArgs = {
  active: false,
  label: "TF2 crafting",
  selectedCount: 0,
  requiredCount: 2,
  onStartRecipe: noOp,
  onStartStatClock: noOp,
  onStartHalloweenOffering: noOp,
  onCancel: noOp,
  onReview: noOp,
};

const meta = {
  title: "Inventory/TF2 Crafting Flows",
  component: TF2CraftingToolbar,
  parameters: {
    docs: {
      description: {
        component: "Deterministic Playwright-captured states for TF2 recipes, Halloween offerings, and trade-up probabilities.",
      },
    },
  },
} satisfies Meta<typeof TF2CraftingToolbar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const RecipeExplanation: Story = {
  args: toolbarArgs,
};

export const HalloweenOffering: Story = {
  args: toolbarArgs,
  render: () => (
    <TF2HalloweenOfferingDialog
      open
      items={[
        item("7001", "Halloween Offering Tool", { itemKind: "tool", toolType: "halloween_offering", craftMaterialType: undefined }),
        item("7002", "Haunted Metal Scrap"),
        item("7003", "Haunted Hat"),
      ]}
      connected
      enabled
      onOpenChange={noOp}
      onExecute={async () => undefined}
      onAccepted={noOp}
    />
  ),
};

export const TradeUpProbabilities: Story = {
  args: toolbarArgs,
  render: () => (
    <TF2TradeUpConfirmationDialog
      open
      items={inputs}
      outcomes={outcomes}
      collectionBreakdown={[{ collection: "Mock Scream Fortress Collection", probability: 1, rarity: "commando", outcomeCount: 2 }]}
      eligibility="Ten items with the same quality and grade, each from a collection with a next-grade output pool."
      deterministic={false}
      outputDescription="One random item from the next grade of the selected collection pool"
      connected
      enabled
      marketPrices={new Map()}
      scanPrices={noPriceScan}
      onOpenChange={noOp}
      onRemove={noOp}
      onExecute={noReceipt}
      onAccepted={noOp}
    />
  ),
};
