import { Show } from "solid-js";
import type { JSX } from "solid-js";
import type { CompactMode } from "../../shared/ui-types.js";
import type {
  ConnectionStatus,
  InitializeStorePurchaseRequest,
  InventoryItemDto,
  InventorySnapshot,
  PriceScanResult,
  PurchaseSession,
  SettingsData,
} from "@cs-inv-edit/contracts";
import { InventoryDetailsPanel } from "./InventoryDetailsPanel.js";
import { Alert } from "../../shared/ui/Alert.js";
import { InventoryGrid } from "./inventory-view-content-sections.js";
import type { InventoryMode } from "../shell/view.js";
import type { StorageMutationFailure } from "./inventory-action-handlers.js";

export interface InventoryViewContentProps {
  inventory: InventorySnapshot | undefined;
  selectionMode: InventoryMode;
  selectedItemIds: string[];
  connection: ConnectionStatus | undefined;
  settings: SettingsData | undefined;
  filteredItems: InventoryItemDto[];
  selectedItem: InventoryItemDto | undefined;
  selectedItemExplicit: boolean;
  selectedItemKey: string | undefined;
  statusMessage: string;
  terminalOfferState:
    | { terminalId: string; state: import("../../shared/ui-types.js").LoadingState; message: string }
    | undefined;
  containerStatusMessage: string;
  renameOpen: boolean;
  draftName: string;
  selectedToolId: string;
  pending: boolean;
  inventoryError: string;
  inventoryDiagnostics: string[];
  inventoryLoading: boolean;
  connected: boolean;
  nameTagTools: InventoryItemDto[];
  compatibleContainerKey: InventoryItemDto | undefined;
  compatibleContainerKeys: InventoryItemDto[];
  selectedContainerKeyId: string;
  canOpenContainer: boolean;
  canUseNameTagOn: boolean;
  compactMode: CompactMode;
  marketPrices: ReadonlyMap<string, number>;
  onMarketPreview: (
    marketName: string,
  ) => Promise<import("@cs-inv-edit/contracts").RelatedItemDto | undefined>;
  onScanPrices: (
    marketNames: string[],
    appId?: number,
  ) => Promise<PriceScanResult | undefined>;
  onSelectItem: (
    item: InventoryItemDto,
    options?: { range: boolean; selected?: boolean },
  ) => void;
  onOpenRenameEditor: (item: InventoryItemDto) => void;
  onRenameSubmit: () => Promise<void> | void;
  onRemoveName: () => Promise<void> | void;
  onOpenContainer: (terminalSelection?: {
    pointsRemaining?: number;
    volatileLimit?: number;
  }) => Promise<void> | void;
  onTerminalPurchase: (
    input: InitializeStorePurchaseRequest,
  ) => Promise<PurchaseSession>;
  onLoadStorageContents: (casketId: string) => Promise<boolean>;
  onBeginMoveIntoStorage: (item: InventoryItemDto) => void;
  movingIntoStorageUnit: InventoryItemDto | undefined;
  browsingStorageUnit: InventoryItemDto | undefined;
  removeFromStorageMode: boolean;
  storageSelectedItemIds: string[];
  storageRetrieval: { completed: number; total: number } | undefined;
  storageFailures: StorageMutationFailure[];
  onBackFromStorage: () => void;
  onToggleRemoveFromStorageMode: () => void;
  onRetrieveFromStorage: () => Promise<void> | void;
  onRetrieveAllFromStorage: () => Promise<void> | void;
  onCancelMoveIntoStorage: () => void;
  onConfirmMoveIntoStorage: () => Promise<void> | void;
  onCloseRename: () => void;
  onDraftNameChange: (value: string) => void;
  onSelectedToolChange: (value: string) => void;
  onSelectedContainerKeyChange: (value: string) => void;
  onRefresh: () => void;
  tradeUpActive: boolean;
  tradeUpSelectedCount: number;
  tradeUpRequiredCount: number;
  onStartTradeUp: () => void;
  onCancelTradeUp: () => void;
  onReviewTradeUp: () => void;
}

function ConnectionAlert(
  props: Pick<InventoryViewContentProps, "inventory" | "connected">,
): JSX.Element | null {
  if (props.inventory?.status !== "requires_connection" || props.connected) {
    return null;
  }

  return (
    <Alert variant="warning">
      Connect a Steam account to load inventory items and enable name-tag
      editing.
    </Alert>
  );
}

function ErrorAlert(
  props: Pick<
    InventoryViewContentProps,
    "inventory" | "inventoryDiagnostics" | "inventoryError"
  >,
): JSX.Element | null {
  if (props.inventory?.status !== "error") {
    return null;
  }

  return (
    <Alert variant="danger">
      <div class="space-y-2">
        <p>
          {props.inventoryError.includes("active elsewhere")
            ? "Steam reports that this account is active in another Steam or CS2 session. Close it there, then use Retry to reconnect."
            : "Inventory sync is unavailable."}
        </p>
        <Show when={props.inventoryError}>
          <details class="text-xs text-rose-100/80">
            <summary class="cursor-pointer">Diagnostics</summary>
            <div class="mt-1 space-y-1 font-mono">
              <p>{props.inventoryError}</p>
              {props.inventoryDiagnostics.map((line) => (
                <p>{line}</p>
              ))}
            </div>
          </details>
        </Show>
      </div>
    </Alert>
  );
}

function MetadataAlert(
  props: Pick<InventoryViewContentProps, "inventory" | "inventoryDiagnostics">,
): JSX.Element | null {
  if (
    props.inventory?.status !== "ready" ||
    props.inventoryDiagnostics.length === 0
  ) {
    return null;
  }

  return (
    <Alert variant="warning">
      <details class="text-xs text-amber-100/80">
        <summary class="cursor-pointer">Inventory metadata diagnostics</summary>
        <div class="mt-1 space-y-1 font-mono">
          {props.inventoryDiagnostics.map((line) => (
            <p>{line}</p>
          ))}
        </div>
      </details>
    </Alert>
  );
}

function StatusAlert(
  props: Pick<InventoryViewContentProps, "statusMessage">,
): JSX.Element | null {
  if (!props.statusMessage) {
    return null;
  }

  return <Alert>{props.statusMessage}</Alert>;
}

function InventoryAlerts(
  props: Pick<
    InventoryViewContentProps,
    | "inventory"
    | "inventoryDiagnostics"
    | "inventoryError"
    | "statusMessage"
    | "connected"
  >,
): JSX.Element {
  return (
    <>
      <ConnectionAlert
        inventory={props.inventory}
        connected={props.connected}
      />
      <ErrorAlert
        inventory={props.inventory}
        inventoryDiagnostics={props.inventoryDiagnostics}
        inventoryError={props.inventoryError}
      />
      <MetadataAlert
        inventory={props.inventory}
        inventoryDiagnostics={props.inventoryDiagnostics}
      />
      <StatusAlert statusMessage={props.statusMessage} />
    </>
  );
}

export function InventoryViewContent(props: InventoryViewContentProps) {
  const inventoryDebugEnabled = () =>
    props.settings?.featureFlags.enableInventoryDebug ?? false;
  const storageMutationsEnabled = () =>
    props.connected &&
    (props.settings?.featureFlags.enableStorageMutations ?? false);
  const storageUnavailableReason = () => {
    if (!props.connected) return "Connect to Steam to manage storage contents.";
    if (!props.settings?.featureFlags.enableStorageMutations)
      return "Storage mutations are disabled in Settings.";
    return undefined;
  };
  const detailsPanel = (
    <InventoryDetailsPanel
      selectedItem={props.selectedItem}
      steamId={
        props.connection?.state === "connected"
          ? props.connection.steamId
          : undefined
      }
      settings={props.settings}
      pending={props.pending}
      renameOpen={props.renameOpen}
      draftName={props.draftName}
      selectedToolId={props.selectedToolId}
      inventoryDebugEnabled={inventoryDebugEnabled()}
      storageMutationsEnabled={storageMutationsEnabled()}
      storageUnavailableReason={storageUnavailableReason()}
      nameTagTools={props.nameTagTools}
      compatibleContainerKey={props.compatibleContainerKey}
      compatibleContainerKeys={props.compatibleContainerKeys}
      selectedContainerKeyId={props.selectedContainerKeyId}
      canOpenContainer={props.canOpenContainer}
      canUseNameTagOn={props.canUseNameTagOn}
      containerStatusMessage={props.containerStatusMessage}
      terminalOfferState={props.terminalOfferState}
      onOpenRenameEditor={props.onOpenRenameEditor}
      onRenameSubmit={props.onRenameSubmit}
      onRemoveName={props.onRemoveName}
      onOpenContainer={props.onOpenContainer}
      onTerminalPurchase={props.onTerminalPurchase}
      onLoadStorageContents={props.onLoadStorageContents}
      onBeginMoveIntoStorage={props.onBeginMoveIntoStorage}
      onMarketPreview={props.onMarketPreview}
      onScanPrices={props.onScanPrices}
      onCloseRename={props.onCloseRename}
      onDraftNameChange={props.onDraftNameChange}
      onSelectedToolChange={props.onSelectedToolChange}
      onSelectedContainerKeyChange={props.onSelectedContainerKeyChange}
    />
  );

  return (
    <div class="flex min-h-0 flex-1 flex-col gap-4">
      <InventoryGrid
        inventory={props.inventory}
        inventoryLoading={props.inventoryLoading}
        filteredItems={props.filteredItems}
        selectionMode={props.selectionMode}
        selectedItem={props.selectedItem}
        selectedItemExplicit={props.selectedItemExplicit}
        selectedItemIds={props.selectedItemIds}
        compactMode={props.compactMode}
        marketPrices={props.marketPrices}
        onSelectItem={props.onSelectItem}
        onRefresh={props.onRefresh}
        detailsPanel={detailsPanel}
        browsingStorageUnit={props.browsingStorageUnit}
        movingIntoStorageUnit={props.movingIntoStorageUnit}
        removeFromStorageMode={props.removeFromStorageMode}
        storageSelectedItemIds={props.storageSelectedItemIds}
        storageRetrieval={props.storageRetrieval}
        storageFailures={props.storageFailures}
        storageMutationsEnabled={storageMutationsEnabled()}
        storageUnavailableReason={storageUnavailableReason()}
        onBackFromStorage={props.onBackFromStorage}
        onToggleRemoveFromStorageMode={props.onToggleRemoveFromStorageMode}
        onRetrieveFromStorage={props.onRetrieveFromStorage}
        onRetrieveAllFromStorage={props.onRetrieveAllFromStorage}
        onCancelMoveIntoStorage={props.onCancelMoveIntoStorage}
        onConfirmMoveIntoStorage={props.onConfirmMoveIntoStorage}
        tradeUpActive={props.tradeUpActive}
        tradeUpSelectedCount={props.tradeUpSelectedCount}
        tradeUpRequiredCount={props.tradeUpRequiredCount}
        onStartTradeUp={props.onStartTradeUp}
        onCancelTradeUp={props.onCancelTradeUp}
        onReviewTradeUp={props.onReviewTradeUp}
        alerts={
          <InventoryAlerts
            inventory={props.inventory}
            inventoryDiagnostics={props.inventoryDiagnostics}
            inventoryError={props.inventoryError}
            statusMessage={props.statusMessage}
            connected={props.connected}
          />
        }
      />
    </div>
  );
}
