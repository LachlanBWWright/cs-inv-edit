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
  steamHostedSaleUrl,
  steamInventoryAssetUrl,
} from "../commerce/steam-hosted-selling.js";
import { swapScreenshotUrl } from "../cs2/cs2-screenshot.js";
import type { InventoryDetailsPanelProps } from "./InventoryDetailsPanel.js";
import { TerminalItemSection } from "../commerce/terminal-item-section.js";
import { ActionLink } from "../../shared/ui/ActionLink.js";

function ExternalItemLinks(props: {
  inventoryUrl: string | undefined;
  saleUrl: string | undefined;
  inspectUrl: string | undefined;
  screenshotUrl: string | undefined;
}) {
  return (
    <Show when={props.inventoryUrl || props.inspectUrl}>
      <div class="grid gap-2 sm:grid-cols-2">
        <Show when={props.inventoryUrl} keyed>
          {(url) => (
            <ActionLink href={url} tone="primary">
              View in inventory ↗
            </ActionLink>
          )}
        </Show>
        <Show when={props.saleUrl} keyed>
          {(url) => (
            <ActionLink href={url} tone="primary">
              Sell on Steam ↗
            </ActionLink>
          )}
        </Show>
        <Show when={props.inspectUrl} keyed>
          {(url) => (
            <ActionLink href={url} tone="primary">
              Inspect in game ↗
            </ActionLink>
          )}
        </Show>
        <Show when={props.screenshotUrl} keyed>
          {(url) => <ActionLink href={url}>Generate screenshot ↗</ActionLink>}
        </Show>
      </div>
    </Show>
  );
}

export function SelectedItemContent(props: {
  selected: InventoryItemDto;
  panelProps: InventoryDetailsPanelProps;
}) {
  const inventoryUrl = () =>
    props.panelProps.steamId
      ? steamInventoryAssetUrl(props.panelProps.steamId, {
          appId: 730,
          contextId: "2",
          assetId: props.selected.id,
        })
      : undefined;
  const saleUrl = () =>
    steamHostedSaleUrl({
      steamId: props.panelProps.steamId,
      appId: 730,
      contextId: "2",
      assetId: props.selected.id,
      marketable: props.selected.marketable,
      contained: !!props.selected.casketId,
    });
  const screenshotUrl = () => swapScreenshotUrl(props.selected.inspectUrl);
  return (
    <div class="space-y-4">
      <ItemHeader selected={props.selected} />
      <section class="divide-y divide-slate-800 border-y border-slate-800/80">
        <div class="py-4">
          <PropertyGrid
            selected={props.selected}
            selectedMarketPreview={props.panelProps.selectedMarketPreview}
            selectedMarketLoading={
              props.panelProps.selectedMarketLoading ?? false
            }
            onOpenCollection={
              props.panelProps.onOpenCollection ?? (() => undefined)
            }
            appearance="plain"
            showMarket={false}
            showWear={false}
          />
        </div>
        <VendorPricePreview
          appId={730}
          marketName={props.selected.marketName}
          marketable={props.selected.marketable}
          result={props.panelProps.selectedPriceScan}
          loading={props.panelProps.selectedPriceScanLoading ?? false}
          appearance="plain"
        />
        <Show
          when={
            props.selected.kind === "weapon_skin" &&
            props.selected.paintWear !== undefined
          }
        >
          <div class="py-4">
            <WearRangeBar
              wear={props.selected.paintWear!}
              min={props.selected.paintWearMin}
              max={props.selected.paintWearMax}
              appearance="plain"
            />
          </div>
        </Show>
      </section>
      <ExternalItemLinks
        inventoryUrl={inventoryUrl()}
        saleUrl={saleUrl()}
        inspectUrl={props.selected.inspectUrl}
        screenshotUrl={screenshotUrl()}
      />
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
        storageContentsLoading={
          props.panelProps.storageContentsLoading ?? false
        }
        storageMutationsEnabled={props.panelProps.storageMutationsEnabled}
        storageUnavailableReason={props.panelProps.storageUnavailableReason}
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
