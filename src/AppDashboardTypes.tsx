import type {
  ActivityEvent,
  DashboardData,
  InventoryItem,
  StatusFlag,
} from "./types";

export type Notice = {
  tone: "info" | "success" | "warning";
  message: string;
};

export type MetricCard = {
  label: string;
  value: string;
  detail: string;
};

export type WorkflowCard = {
  label: string;
  value: string;
  detail: string;
};

export type NextBestAction = {
  title: string;
  detail: string;
};

export type StickerPlanSummary = {
  kind: "ok" | "err";
  message: string;
  value?: {
    confidence: string;
    notes: string[];
  };
};

export type PlanSummary<T> = {
  kind: "ok" | "err";
  message: string;
  value?: T;
};

export type AppDashboardProps = {
  dashboard: DashboardData | undefined;
  platformLabel: string;
  notice: Notice;
  noticeClasses: string;
  metricCards: MetricCard[];
  workflowCards: WorkflowCard[];
  nextBestAction: NextBestAction;
  collectionFilter: string;
  onCollectionFilterChange: (value: string) => void;
  filteredInventory: InventoryItem[];
  selectedItemId: string;
  onSelectItem: (itemId: string) => void;
  tradeUpQueue: string[];
  onTradeUpToggle: (itemId: string) => void;
  stickerPreset: string;
  onStickerPresetChange: (preset: string) => void;
  stickerPlanSummary: StickerPlanSummary | undefined;
  onStickerReview: () => void;
  tradeUpPlanSummary:
    | PlanSummary<{
        collection: string;
        averageWear: string;
        predictedTier: string;
        outputTheme: string;
      }>
    | undefined;
  onTradeUpReview: () => void;
  storagePlanSummary:
    PlanSummary<{ summary: string; targetFreeSlots: number }> | undefined;
  onStorageReview: () => void;
  selectedStorageId: string;
  onSelectStorage: (unitId: string) => void;
  toneClasses: Record<StatusFlag["tone"], string>;
  readinessClasses: Record<InventoryItem["readiness"], string>;
  activityClasses: Record<ActivityEvent["status"], string>;
};
