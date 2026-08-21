import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { ArmoryStatus } from "./ArmoryStatus.js";

const meta = {
  title: "Armory/Status",
  component: ArmoryStatus,
  decorators: [
    (Story) => (
      <section class="mx-auto grid max-w-2xl gap-4 rounded-2xl border border-slate-800 bg-slate-900 p-6">
        <Story />
      </section>
    ),
  ],
} satisfies Meta<typeof ArmoryStatus>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Ready: Story = {
  args: {
    armory: {
      balance: 73,
      generationTime: 1,
      itemIds: [],
      offers: [],
      refreshedAt: "2026-08-13T00:00:00Z",
      status: "ready",
    },
    diagnostics: [],
    purchaseError: undefined,
  },
};

export const Loading: Story = {
  args: {
    armory: {
      balance: 0,
      generationTime: 0,
      itemIds: [],
      offers: [],
      refreshedAt: "",
      status: "loading",
      message: "Waiting for GC Armory state",
    },
    diagnostics: [],
    purchaseError: undefined,
  },
};

export const RequiresConnection: Story = {
  args: {
    armory: {
      balance: 0,
      generationTime: 0,
      itemIds: [],
      offers: [],
      refreshedAt: "",
      status: "requires_connection",
    },
    diagnostics: [],
    purchaseError: undefined,
  },
};

export const ErrorAndDiagnostics: Story = {
  args: {
    armory: {
      balance: 0,
      generationTime: 0,
      itemIds: [],
      offers: [],
      refreshedAt: "",
      status: "error",
      message: "Armory state could not be decoded.",
    },
    diagnostics: ["GC response did not include the expected XP shop object."],
    purchaseError: "The previous redemption was rejected.",
  },
};
