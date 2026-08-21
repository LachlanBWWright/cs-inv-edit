import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { OperationsView } from "./OperationsView.js";

const meta = {
  title: "Operations/Activity Log",
  component: OperationsView,
} satisfies Meta<typeof OperationsView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Populated: Story = {
  args: {
    receipts: [
      {
        operationId: "op-open-01",
        type: "open_container",
        state: "completed",
        createdAt: "2026-08-13T01:12:00Z",
      },
      {
        operationId: "op-name-02",
        type: "apply_name_tag",
        state: "awaiting_gc_confirmation",
        createdAt: "2026-08-13T01:14:00Z",
      },
    ],
    events: [
      {
        operationId: "op-open-01",
        type: "inventory_reconciled",
        state: "completed",
        message: "A new inventory item was confirmed.",
        createdAt: "2026-08-13T01:12:04Z",
      },
      {
        operationId: "op-name-02",
        type: "gc_request_sent",
        state: "awaiting_gc_confirmation",
        message: "Waiting for the updated item state.",
        createdAt: "2026-08-13T01:14:02Z",
      },
    ],
  },
};

export const Empty: Story = {
  args: { receipts: [], events: [] },
};
