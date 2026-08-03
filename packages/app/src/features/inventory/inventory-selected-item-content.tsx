import { Show } from "solid-js";
import type { InventoryItemDto } from "@cs-inv-edit/contracts";
import { WearRangeBar } from "../../shared/ui/WearRangeBar.js";
import {
  ActionBar,
  DiagnosticsPanel,
  ItemHeader,
  PropertyGrid,
  RenameEditor,
  TradeUpOutcomes,
} from "./inventory-details-panel-sections.js";
import { VendorPricePreview } from "../commerce/VendorPricePreview.js";
import {
  steamHostedSaleURL,
  steamInventoryAssetURL,
} from "../commerce/steam-hosted-selling.js";
import { swapScreenshotURL } from "../cs2/cs2-screenshot.js";
import type { InventoryDetailsPanelProps } from "./InventoryDetailsPanel.js";
import { TerminalItemSection } from "../commerce/terminal-item-section.js";
import { ActionLink } from "../../shared/ui/ActionLink.js";
export function SelectedItemContent(props: {
  selected: InventoryItemDto;
  panelProps: InventoryDetailsPanelProps;
}) {
  const inventoryURL = () =>
    props.panelProps.steamId
      ? steamInventoryAssetURL(props.panelProps.steamId, {
          appId: 730,
          contextId: "2",
          assetId: props.selected.id,
        })
      : undefined;
  const saleURL = () =>
    steamHostedSaleURL({
      steamId: props.panelProps.steamId,
      appId: 730,
      contextId: "2",
      assetId: props.selected.id,
      marketable: props.selected.marketable,
      contained: !!props.selected.casketId,
    });
  const screenshotURL = () => swapScreenshotURL(props.selected.inspectUrl);
  return (
    <div class="space-y-4">
      <ItemHeader selected={props.selected} />
      <PropertyGrid
        selected={props.selected}
        selectedMarketPreview={props.panelProps.selectedMarketPreview}
        selectedMarketLoading={props.panelProps.selectedMarketLoading ?? false}
        onOpenCollection={
          props.panelProps.onOpenCollection ?? (() => undefined)
        }
      />
      <VendorPricePreview
        appId={730}
        marketName={props.selected.marketName}
        marketable={props.selected.marketable}
        result={props.panelProps.selectedPriceScan}
        loading={props.panelProps.selectedPriceScanLoading ?? false}
      />
      <Show when={inventoryURL() || props.selected.inspectUrl}>
        <div class="grid gap-2 sm:grid-cols-2">
          <Show when={inventoryURL()}>
            {(viewURL) => (
              <ActionLink href={viewURL()} tone="primary">
                View in inventory ↗
              </ActionLink>
            )}
          </Show>
          <Show when={saleURL()}>
            {(url) => (
              <ActionLink href={url()} tone="primary">
                Sell on Steam ↗
              </ActionLink>
            )}
          </Show>
          <Show when={props.selected.inspectUrl}>
            {(url) => (
              <ActionLink href={url()} tone="primary">
                Inspect in game ↗
              </ActionLink>
            )}
          </Show>
          <Show when={screenshotURL()}>
            {(url) => (
              <ActionLink href={url()}>Generate screenshot ↗</ActionLink>
            )}
          </Show>
        </div>
      </Show>
      <Show
        when={
          props.selected.kind === "weapon_skin" &&
          props.selected.paintWear !== undefined
        }
      >
        <WearRangeBar
          wear={props.selected.paintWear!}
          min={props.selected.paintWearMin}
          max={props.selected.paintWearMax}
        />
      </Show>
      <TradeUpOutcomes
        selected={props.selected}
        onPreview={props.panelProps.onPreviewTradeUp}
        returnEstimate={props.panelProps.tradeUpReturnEstimate}
        returnEstimateLoading={props.panelProps.tradeUpReturnLoading}
      />
      <TerminalItemSection
        selected={props.selected}
        panelProps={props.panelProps}
      />
      <ActionBar
        selected={props.selected}
        pending={props.panelProps.pending}
        canOpenContainer={props.panelProps.canOpenContainer}
        canUseNameTagOn={props.panelProps.canUseNameTagOn}
        compatibleContainerKey={props.panelProps.compatibleContainerKey}
        compatibleContainerKeys={props.panelProps.compatibleContainerKeys}
        selectedContainerKeyId={props.panelProps.selectedContainerKeyId}
        containerStatusMessage={props.panelProps.containerStatusMessage}
        onOpenContainer={props.panelProps.onOpenContainer}
        onOpenRenameEditor={props.panelProps.onOpenRenameEditor}
        onRemoveName={props.panelProps.onRemoveName}
        onShowContents={props.panelProps.onShowContents ?? (() => undefined)}
        onViewStorageContents={
          props.panelProps.onViewStorageContents ?? (() => undefined)
        }
        onBeginMoveIntoStorage={
          props.panelProps.onBeginMoveIntoStorage ?? (() => undefined)
        }
        onSelectedContainerKeyChange={
          props.panelProps.onSelectedContainerKeyChange
        }
      />
      <RenameEditor
        selected={props.selected}
        renameOpen={props.panelProps.renameOpen}
        draftName={props.panelProps.draftName}
        nameTagTools={props.panelProps.nameTagTools}
        pending={props.panelProps.pending}
        selectedToolId={props.panelProps.selectedToolId}
        onRenameSubmit={props.panelProps.onRenameSubmit}
        onCloseRename={props.panelProps.onCloseRename}
        onDraftNameChange={props.panelProps.onDraftNameChange}
        onSelectedToolChange={props.panelProps.onSelectedToolChange}
      />
      <DiagnosticsPanel
        selected={props.selected}
        inventoryDebugEnabled={props.panelProps.inventoryDebugEnabled}
      />
    </div>
  );
}
