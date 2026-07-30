import { Show } from "solid-js";
import type { JSX } from "solid-js";
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
import { Alert } from "./ui/Alert.js";
import { InventoryGrid } from "./inventory-view-content-sections.js";
import type { InventoryMode } from "../view.js";

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
    | { terminalId: string; state: "loading" | "error"; message: string }
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
  compactMode: "icons" | "concise" | "detailed";
  marketPrices: ReadonlyMap<string, number>;
  onMarketPreview: (
    marketName: string,
  ) => Promise<import("@cs-inv-edit/contracts").RelatedItemDto | undefined>;
  onScanPrices: (
    marketNames: string[],
    appId?: number,
  ) => Promise<PriceScanResult | undefined>;
  onSelectItem: (item: InventoryItemDto, options?: { range: boolean }) => void;
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
  browsingStorageUnit: InventoryItemDto | undefined;
  removeFromStorageMode: boolean;
  storageSelectedItemIds: string[];
  storageRetrieval: { completed: number; total: number } | undefined;
  onBackFromStorage: () => void;
  onToggleRemoveFromStorageMode: () => void;
  onRetrieveFromStorage: () => Promise<void> | void;
  onRetrieveAllFromStorage: () => Promise<void> | void;
  onCloseRename: () => void;
  onDraftNameChange: (value: string) => void;
  onSelectedToolChange: (value: string) => void;
  onSelectedContainerKeyChange: (value: string) => void;
  onRefresh: () => void;
}

function SelectionAlert(
  props: Pick<InventoryViewContentProps, "selectionMode" | "selectedItemIds">,
): JSX.Element | null {
  if (props.selectionMode === "inventory") {
    return null;
  }

  return (
    <Alert variant="warning">
      {props.selectionMode === "inventory-storage"
        ? "Storage selection is a stub."
        : "Trade-up selection is a stub."}{" "}
      Select multiple inventory items below; no operation will be performed.
      Selected: {props.selectedItemIds.length}.
    </Alert>
  );
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
        <p>Inventory sync is unavailable.</p>
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
    | "selectionMode"
    | "selectedItemIds"
    | "connected"
  >,
): JSX.Element {
  return (
    <>
      <SelectionAlert
        selectionMode={props.selectionMode}
        selectedItemIds={props.selectedItemIds}
      />
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
      onMarketPreview={props.onMarketPreview}
      onScanPrices={props.onScanPrices}
      onCloseRename={props.onCloseRename}
      onDraftNameChange={props.onDraftNameChange}
      onSelectedToolChange={props.onSelectedToolChange}
      onSelectedContainerKeyChange={props.onSelectedContainerKeyChange}
    />
  );

  return (
    <div class="flex h-full min-h-0 flex-col gap-4">
      <InventoryAlerts
        inventory={props.inventory}
        inventoryDiagnostics={props.inventoryDiagnostics}
        inventoryError={props.inventoryError}
        selectionMode={props.selectionMode}
        selectedItemIds={props.selectedItemIds}
        statusMessage={props.statusMessage}
        connected={props.connected}
      />
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
        removeFromStorageMode={props.removeFromStorageMode}
        storageSelectedItemIds={props.storageSelectedItemIds}
        storageRetrieval={props.storageRetrieval}
        onBackFromStorage={props.onBackFromStorage}
        onToggleRemoveFromStorageMode={props.onToggleRemoveFromStorageMode}
        onRetrieveFromStorage={props.onRetrieveFromStorage}
        onRetrieveAllFromStorage={props.onRetrieveAllFromStorage}
      />
      <Show
        when={
          props.selectionMode !== "inventory" &&
          props.selectedItemIds.length > 0
        }
      >
        <div class="fixed inset-x-3 bottom-3 z-40 flex items-center justify-between gap-3 rounded-2xl border border-amber-400/30 bg-slate-950/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-2xl backdrop-blur lg:hidden">
          <div class="min-w-0">
            <p class="text-sm font-semibold text-slate-100">
              {props.selectedItemIds.length} item
              {props.selectedItemIds.length === 1 ? "" : "s"} selected
            </p>
            <p class="truncate text-xs text-slate-500">
              {props.selectionMode === "inventory-storage"
                ? "Storage selection"
                : "Trade-up contract selection"}
            </p>
          </div>
          <span class="shrink-0 text-xs font-semibold text-amber-200">
            Review selection
          </span>
        </div>
      </Show>
    </div>
  );
}
