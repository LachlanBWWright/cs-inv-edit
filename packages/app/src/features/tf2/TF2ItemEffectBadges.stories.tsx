import type { EconomyInventoryItemDto } from "@cs-inv-edit/contracts";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { TF2ItemEffectBadges } from "./TF2ItemEffectBadges.js";

const item = (quality: string, name: string): EconomyInventoryItemDto => ({
  game: "tf2",
  appId: 440,
  contextId: "2",
  assetId: name,
  name,
  quantity: 1,
  quality,
  tradable: true,
  marketable: true,
  tags: [],
  details: {
    game: "tf2",
    level: 100,
    qualityId: 5,
    inventoryPosition: 1,
    originId: 0,
    style: 0,
    flags: 0,
    attributes: {},
  },
});

function EffectsGallery() {
  const examples = [
    item("Strange", "Strange Scattergun"),
    item("Unusual", "Unusual Team Captain"),
    { ...item("Strange Unusual", "Strange Unusual Hat"), rarity: "Unusual" },
  ];
  return (
    <section class="mx-auto grid max-w-3xl gap-4 sm:grid-cols-3">
      {examples.map((example) => (
        <div class="relative min-h-36 rounded-2xl border border-slate-700 bg-slate-900 p-4">
          <TF2ItemEffectBadges item={example} />
          <p class="mt-16 text-sm font-semibold text-slate-100">{example.name}</p>
          <p class="mt-1 text-xs text-slate-400">{example.quality}</p>
        </div>
      ))}
    </section>
  );
}

const meta = {
  title: "TF2/Item Effects",
  component: TF2ItemEffectBadges,
} satisfies Meta<typeof TF2ItemEffectBadges>;

export default meta;
type Story = StoryObj<typeof meta>;

export const EffectStates: Story = {
  args: { item: item("Strange", "Strange Scattergun") },
  render: () => <EffectsGallery />,
};
