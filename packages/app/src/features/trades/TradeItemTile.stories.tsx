import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { TradeItemTile } from "./trade-item-tile.js";

const meta = {
  title: "Trades/Item Tile",
  component: TradeItemTile,
  decorators: [
    (Story) => (
      <div class="mx-auto grid max-w-md gap-3">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof TradeItemTile>;

export default meta;
type Story = StoryObj<typeof meta>;

export const MarketItem: Story = {
  args: {
    item: {
      appId: 730,
      contextId: "2",
      assetId: "123456789",
      amount: 1,
      name: "AK-47 | Slate",
      marketName: "AK-47 | Slate (Field-Tested)",
      type: "Restricted Rifle",
      tradable: true,
      marketable: true,
    },
  },
};

export const StackedItem: Story = {
  args: {
    item: {
      appId: 440,
      contextId: "2",
      assetId: "987654321",
      amount: 12,
      name: "Mann Co. Supply Crate Key",
      type: "Level 5 Tool",
      tradable: true,
      marketable: true,
    },
  },
};
