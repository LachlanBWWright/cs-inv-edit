import { Show } from "solid-js";
import type { InventoryItemDto } from "@cs-inv-edit/contracts";
import { WearRangeBar } from "./ui/WearRangeBar.js";
import {
  ActionBar,
  DiagnosticsPanel,
  ItemHeader,
  PropertyGrid,
  RenameEditor,
  TradeUpOutcomes,
} from "./inventory-details-panel-sections.js";
import { VendorPricePreview } from "./VendorPricePreview.js";
import {
  steamHostedSaleURL,
  steamInventoryAssetURL,
} from "./steam-hosted-selling.js";
import { swapScreenshotURL } from "./cs2-screenshot.js";
import type { InventoryDetailsPanelProps } from "./InventoryDetailsPanel.js";
import { TerminalItemSection } from "./terminal-item-section.js";
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
  const screenshotURL = () =>
    props.selected.kind === "weapon_skin"
      ? swapScreenshotURL(props.selected.inspectUrl)
      : undefined;
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
              <a
                class="block w-full rounded-xl border border-sky-500/40 bg-sky-950/30 px-4 py-3 text-center text-sm font-semibold text-sky-100 hover:bg-sky-900/40"
                href={viewURL()}
                target="_blank"
                rel="noopener noreferrer"
              >
                View in inventory ↗
              </a>
            )}
          </Show>
          <Show when={saleURL()}>
            {(url) => (
              <a
                class="block w-full rounded-xl border border-emerald-500/40 bg-emerald-950/30 px-4 py-3 text-center text-sm font-semibold text-emerald-100 hover:bg-emerald-900/40"
                href={url()}
                target="_blank"
                rel="noopener noreferrer"
              >
                Sell on Steam ↗
              </a>
            )}
          </Show>
          <Show when={props.selected.inspectUrl}>
            {(url) => (
              <a
                class="block w-full rounded-xl border border-cyan-500/40 bg-cyan-950/30 px-4 py-3 text-center text-sm font-semibold text-cyan-100 hover:bg-cyan-900/40"
                href={url()}
                target="_blank"
                rel="noopener noreferrer"
              >
                Inspect in game ↗
              </a>
            )}
          </Show>
          <Show when={screenshotURL()}>
            {(url) => (
              <a
                class="block w-full rounded-xl border border-violet-500/40 bg-violet-950/30 px-4 py-3 text-center text-sm font-semibold text-violet-100 hover:bg-violet-900/40"
                href={url()}
                target="_blank"
                rel="noopener noreferrer"
              >
                Generate screenshot ↗
              </a>
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
      <TerminalItemSection selected={props.selected} panelProps={props.panelProps} />
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
