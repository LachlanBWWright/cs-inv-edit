import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { CS2ProgressionSection } from "./cs2-progression-section.js";

const textValue = (value: unknown) =>
  typeof value === "string" || typeof value === "number"
    ? String(value)
    : undefined;

const meta = {
  title: "CS2/Progression",
  component: CS2ProgressionSection,
} satisfies Meta<typeof CS2ProgressionSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ActiveMissions: Story = {
  args: {
    level: "37",
    xp: "3,842",
    missions: [
      {
        kind: "weekly_mission",
        data: {
          name: "Competitive specialist",
          description: "Win rounds in Competitive matches",
          gamemode: "competitive",
          mapgroup: "mg_active",
          points_required: 20,
          progress: 13,
          xp_reward: 1_200,
        },
      },
      {
        kind: "recurring_mission",
        data: {
          name: "Earn XP",
          description: "Earn experience in official game modes",
          points_remaining: 850,
          xp_reward: 500,
        },
      },
    ],
    seasonal: [
      {
        tier_unlocked: 8,
        premium_tiers: 3,
        redeemable_balance: 12,
        missions_completed: 17,
      },
    ],
    textValue,
    missionName: (data, fallback) => textValue(data.name) ?? fallback,
    dateLabel: () => undefined,
  },
};

export const Empty: Story = {
  args: {
    level: undefined,
    xp: undefined,
    missions: [],
    seasonal: [],
    textValue,
    missionName: (_data, fallback) => fallback,
    dateLabel: () => undefined,
  },
};
