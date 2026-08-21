import type { Meta, StoryObj } from "storybook-solidjs-vite";
import type { PriceScanResult } from "@cs-inv-edit/contracts";
import { ReturnEstimateCard } from "./ReturnEstimateCard.js";
import { VendorPricePreview } from "./VendorPricePreview.js";

const prices: PriceScanResult = {
  currency: "USD",
  scannedAt: "2026-08-13T00:00:00Z",
  cacheState: "fresh",
  listings: [],
  errors: [{ source: "waxpeer", message: "No matching listing" }],
  items: [
    {
      marketName: "AK-47 | Slate (Field-Tested)",
      quotes: [
        {
          source: "steam",
          marketName: "AK-47 | Slate (Field-Tested)",
          currency: "USD",
          amountMinor: 418,
          displayPrice: "$4.18",
          priceMultiplier: 1,
          listingCount: 1_284,
          observedAt: "2026-08-13T00:00:00Z",
        },
        {
          source: "csfloat",
          marketName: "AK-47 | Slate (Field-Tested)",
          currency: "USD",
          amountMinor: 376,
          displayPrice: "$3.76",
          priceMultiplier: 1,
          listingCount: 327,
          observedAt: "2026-08-13T00:00:00Z",
        },
      ],
    },
  ],
};

function CommerceGallery(props: { loading?: boolean; stale?: boolean }) {
  const result = () =>
    props.stale ? { ...prices, cacheState: "stale" as const } : prices;
  return (
    <section class="mx-auto grid max-w-4xl gap-5 md:grid-cols-2">
      <VendorPricePreview
        appId={730}
        marketName="AK-47 | Slate (Field-Tested)"
        marketable
        result={result()}
        loading={!!props.loading}
      />
      <ReturnEstimateCard
        estimate={{
          expectedValueMinor: 812,
          costMinor: 624,
          roiPercent: 30.1,
          pricedOutcomes: 14,
          totalOutcomes: 16,
        }}
        note="Estimate uses currently available market observations."
      />
    </section>
  );
}

const meta = {
  title: "Commerce/Market Data",
  component: VendorPricePreview,
  args: {
    appId: 730,
    loading: false,
  },
} satisfies Meta<typeof VendorPricePreview>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Loaded: Story = { render: () => <CommerceGallery /> };
export const StalePrices: Story = {
  render: () => <CommerceGallery stale />,
};
export const Loading: Story = {
  render: () => <CommerceGallery loading />,
};
