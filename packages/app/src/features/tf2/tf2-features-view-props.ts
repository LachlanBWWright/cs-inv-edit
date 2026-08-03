import type {
  GameInventorySnapshot,
  OperationReceipt,
  TF2FeatureSnapshot,
} from "@cs-inv-edit/contracts";

export interface TF2FeaturesViewProps {
  snapshot?: GameInventorySnapshot;
  features?: TF2FeatureSnapshot;
  loading: boolean;
  compactMode: "icons" | "concise" | "detailed";
  onRefresh: () => void;
  onOperation: (
    type: string,
    input: unknown,
    suppressToast?: boolean,
  ) => Promise<OperationReceipt>;
}
