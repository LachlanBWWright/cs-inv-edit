import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { AccountIntroduction } from "./AccountIntroduction.js";

const meta = {
  title: "Accounts/Introduction",
  component: AccountIntroduction,
  decorators: [
    (Story) => (
      <div class="mx-auto max-w-3xl rounded-2xl border border-slate-800 bg-slate-900 p-8">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof AccountIntroduction>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
