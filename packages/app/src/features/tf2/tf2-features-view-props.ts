import type {
  GameInventorySnapshot,
  OperationReceipt,
  TF2FeatureSnapshot,
} from "@cs-inv-edit/contracts";
import type { CompactMode } from "../../shared/ui-types.js";

export interface TF2FeaturesViewProps {
  snapshot?: GameInventorySnapshot;
  features?: TF2FeatureSnapshot;
  loading: boolean;
  compactMode: CompactMode;
  onRefresh: () => void;
  onOperation: (
    type: string,
    input: unknown,
    suppressToast?: boolean,
  ) => Promise<OperationReceipt>;
}
