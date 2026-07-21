import { Show } from "solid-js";
import type { JSX } from "solid-js";
import type { ConnectionStatus, InventoryItemDto, InventorySnapshot, SettingsData } from "@cs-inv-edit/contracts";
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
  selectedItemKey: string | undefined;
  statusMessage: string;
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
  onMarketPreview: (marketName: string) => Promise<import("@cs-inv-edit/contracts").RelatedItemDto | undefined>;
  onSelectItem: (item: InventoryItemDto) => void;
  onOpenRenameEditor: (item: InventoryItemDto) => void;
  onRenameSubmit: () => Promise<void> | void;
  onRemoveName: () => Promise<void> | void;
  onOpenContainer: () => Promise<void> | void;
  onCloseRename: () => void;
  onDraftNameChange: (value: string) => void;
  onSelectedToolChange: (value: string) => void;
  onSelectedContainerKeyChange: (value: string) => void;
  onRefresh: () => void;
}

function SelectionAlert(props: Pick<InventoryViewContentProps, 'selectionMode' | 'selectedItemIds'>): JSX.Element | null {
  if (props.selectionMode === "inventory") {
    return null;
  }

  return (
    <Alert variant="warning">
      {props.selectionMode === "inventory-storage" ? "Storage selection is a stub." : "Trade-up selection is a stub."} Select multiple inventory items below; no operation will be performed. Selected: {props.selectedItemIds.length}.
    </Alert>
  );
}

function ConnectionAlert(props: Pick<InventoryViewContentProps, 'inventory' | 'connected'>): JSX.Element | null {
  if (props.inventory?.status !== "requires_connection" || props.connected) {
    return null;
  }

  return <Alert variant="warning">Connect a Steam account to load inventory items and enable name-tag editing.</Alert>;
}

function ErrorAlert(props: Pick<InventoryViewContentProps, 'inventory' | 'inventoryDiagnostics' | 'inventoryError'>): JSX.Element | null {
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
        {props.inventoryDiagnostics.map((line) => <p>{line}</p>)}
            </div>
          </details>
        </Show>
      </div>
    </Alert>
  );
}

function MetadataAlert(props: Pick<InventoryViewContentProps, 'inventory' | 'inventoryDiagnostics'>): JSX.Element | null {
  if (props.inventory?.status !== "ready" || props.inventoryDiagnostics.length === 0) {
    return null;
  }

  return (
    <Alert variant="warning">
      <details class="text-xs text-amber-100/80">
        <summary class="cursor-pointer">Inventory metadata diagnostics</summary>
        <div class="mt-1 space-y-1 font-mono">
        {props.inventoryDiagnostics.map((line) => <p>{line}</p>)}
        </div>
      </details>
    </Alert>
  );
}

function StatusAlert(props: Pick<InventoryViewContentProps, 'statusMessage'>): JSX.Element | null {
  if (!props.statusMessage) {
    return null;
  }

  return <Alert>{props.statusMessage}</Alert>;
}

function InventoryAlerts(props: Pick<InventoryViewContentProps, 'inventory' | 'inventoryDiagnostics' | 'inventoryError' | 'statusMessage' | 'selectionMode' | 'selectedItemIds' | 'connected'>): JSX.Element {
  return (
    <>
      <SelectionAlert selectionMode={props.selectionMode} selectedItemIds={props.selectedItemIds} />
      <ConnectionAlert inventory={props.inventory} connected={props.connected} />
      <ErrorAlert inventory={props.inventory} inventoryDiagnostics={props.inventoryDiagnostics} inventoryError={props.inventoryError} />
      <MetadataAlert inventory={props.inventory} inventoryDiagnostics={props.inventoryDiagnostics} />
      <StatusAlert statusMessage={props.statusMessage} />
    </>
  );
}

export function InventoryViewContent(props: InventoryViewContentProps) {
  const inventoryDebugEnabled = () => props.settings?.featureFlags.enableInventoryDebug ?? false;
  const detailsPanel = (
    <InventoryDetailsPanel
      selectedItem={props.selectedItem}
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
      onOpenRenameEditor={props.onOpenRenameEditor}
      onRenameSubmit={props.onRenameSubmit}
      onRemoveName={props.onRemoveName}
      onOpenContainer={props.onOpenContainer}
      onMarketPreview={props.onMarketPreview}
      onCloseRename={props.onCloseRename}
      onDraftNameChange={props.onDraftNameChange}
      onSelectedToolChange={props.onSelectedToolChange}
      onSelectedContainerKeyChange={props.onSelectedContainerKeyChange}
    />
  );

  return (
    <div class="flex h-full min-h-0 flex-col gap-4">
      <InventoryAlerts inventory={props.inventory} inventoryDiagnostics={props.inventoryDiagnostics} inventoryError={props.inventoryError} selectionMode={props.selectionMode} selectedItemIds={props.selectedItemIds} statusMessage={props.statusMessage} connected={props.connected} />
      <InventoryGrid inventory={props.inventory} inventoryLoading={props.inventoryLoading} filteredItems={props.filteredItems} selectionMode={props.selectionMode} selectedItem={props.selectedItem} selectedItemIds={props.selectedItemIds} compactMode={props.compactMode} onSelectItem={props.onSelectItem} onRefresh={props.onRefresh} detailsPanel={detailsPanel} />
    </div>
  );
}
