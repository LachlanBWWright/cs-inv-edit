import { Show } from "solid-js";
import type {
  EconomyInventorySource,
  GameInventorySnapshot,
  OperationReceipt,
  PriceScanResult,
  ProtocolTraceEntry,
  SettingsData,
  TF2FeatureSnapshot,
} from "@cs-inv-edit/contracts";
import type { CompactMode } from "../../shared/ui-types.js";
import { Alert } from "../../shared/ui/Alert.js";
import { InventoryLoadingState } from "../../shared/ui/InventoryLoadingState.js";
import { PullToRefresh } from "../../shared/ui/PullToRefresh.js";
import { ResponsiveInspector } from "../../shared/ui/ResponsiveInspector.js";
import type { EconomyInventorySort } from "./game-inventory-utils.js";
import { RevealAnimation } from "../../shared/ui/RevealAnimation.js";
import { createGameInventoryModel } from "./game-inventory-model.js";
import { GameInventoryDetails } from "./game-inventory-details-panel.js";
import { GameInventoryTF2Activity } from "./GameInventoryTF2Activity.js";
import { InventoryItemsGrid } from "./InventoryItemsGrid.js";
import { InventoryTradeUpToolbar } from "./InventoryTradeUpToolbar.js";
import { createTF2TradeUp } from "./tf2-trade-up.js";
import { TF2TradeUpConfirmationDialog } from "./TF2TradeUpConfirmationDialog.js";
import { createTF2Crafting } from "./tf2-crafting-controller.js";
import { TF2CraftingToolbar } from "./TF2CraftingToolbar.js";

function SelectedItemSummary(props: { name: string; subtitle: string }) {
  return (
    <div class="min-w-0">
      <p class="truncate text-sm font-semibold text-slate-100">{props.name}</p>
      <p class="mt-0.5 truncate text-xs text-slate-500">{props.subtitle}</p>
    </div>
  );
}

export interface GameInventoryViewProps {
  game: EconomyInventorySource;
  loading: boolean;
  snapshot?: GameInventorySnapshot;
  connected?: boolean;
  steamId?: string;
  settings?: SettingsData;
  query: string;
  tagFilter: string;
  selectedAssetId?: string;
  setSelectedAssetId: (id: string | undefined) => void;
  compactMode: CompactMode;
  sort: EconomyInventorySort;
  onRefresh: () => void;
  onScanPrices: (
    marketNames: string[],
    appId?: number,
  ) => Promise<PriceScanResult | undefined>;
  onOperation?: (type: string, input: unknown) => Promise<OperationReceipt>;
  tf2Features?: TF2FeatureSnapshot;
  showTF2Activity?: boolean;
  protocolEntries?: ProtocolTraceEntry[];
}

export function GameInventoryView(props: GameInventoryViewProps) {
  const model = createGameInventoryModel(props);
  const {
    matchGroup,
    setMatchGroup,
    marketPrices,
    tf2ContainerPreview,
    setTF2ContainerPreview,
    snapshot,
    title,
    items,
    selected,
    dismissActivity,
    tf2Activity,
    submitTF2Operation,
  } = model;
  const tradeUp = createTF2TradeUp(items);
  const crafting = createTF2Crafting(items);
  const workflowActive = () => tradeUp.active() || crafting.active();
  const visibleItems = () =>
    tradeUp.active()
      ? tradeUp.filterItems(items())
      : crafting.filterItems(items());
  const selectedSubtitle = () =>
    [selected()?.type, selected()?.rarity].filter(Boolean).join(" · ");
  return (
    <div class="flex min-h-0 flex-1 flex-col gap-4">
      <Show
        when={
          snapshot()?.status === "requires_connection" &&
          props.connected === false
        }
      >
        <Alert variant="warning">
          Connect a Steam account, then refresh this inventory.
        </Alert>
      </Show>
      <Show when={snapshot()?.status === "error"}>
        <Alert variant="danger">
          {snapshot()?.error || "Inventory loading failed"}
        </Alert>
      </Show>
      <GameInventoryTF2Activity
        game={props.game}
        showTF2Activity={props.showTF2Activity}
        matchGroup={matchGroup}
        setMatchGroup={setMatchGroup}
        submitTF2Operation={submitTF2Operation}
        tf2Features={props.tf2Features}
        tf2Activity={tf2Activity}
        snapshot={snapshot}
        dismissActivity={dismissActivity}
      />
      <div
        class={`grid flex-1 items-start gap-4 ${
          workflowActive()
            ? ""
            : "lg:grid-cols-[minmax(320px,0.95fr)_minmax(0,1fr)]"
        }`}
      >
        <Show when={!workflowActive()}>
          <ResponsiveInspector
            open={!!props.selectedAssetId}
            selectionKey={selected()?.assetId}
            label="Selected economy item details"
            summary={
              <SelectedItemSummary
                name={selected()?.name ?? "Selected item"}
                subtitle={selectedSubtitle()}
              />
            }
          >
            <GameInventoryDetails props={props} model={model} />
          </ResponsiveInspector>
        </Show>
        <PullToRefresh
          class="pb-24 lg:order-2 lg:pb-0"
          onRefresh={props.onRefresh}
        >
          <Show when={props.game === "tf2"}>
            <Show when={!crafting.active()}>
              <InventoryTradeUpToolbar
                active={tradeUp.active()}
                selectedCount={tradeUp.selectedItems().length}
                requiredCount={10}
                onStart={() => {
                  props.setSelectedAssetId(undefined);
                  tradeUp.start();
                }}
                onCancel={tradeUp.reset}
                onReview={() => tradeUp.setConfirmationOpen(true)}
              />
            </Show>
            <Show when={!tradeUp.active()}>
              <TF2CraftingToolbar
                active={crafting.active()}
                label={
                  crafting.statClock()
                    ? "Craft a Civilian Grade Stat Clock"
                    : (crafting.recipe()?.name ?? "TF2 crafting")
                }
                selectedCount={crafting.selectedItems().length}
                requiredCount={crafting.requiredCount()}
                onStartRecipe={(recipe) => {
                  props.setSelectedAssetId(undefined);
                  crafting.startRecipe(recipe);
                }}
                onStartStatClock={() => {
                  props.setSelectedAssetId(undefined);
                  crafting.startStatClock();
                }}
                onCancel={crafting.reset}
                onReview={() => crafting.setConfirmationOpen(true)}
              />
            </Show>
          </Show>
          <InventoryItemsGrid
            items={visibleItems()}
            selectedAssetId={selected()?.assetId}
            selectedAssetIds={
              tradeUp.active()
                ? tradeUp.selectedIds()
                : crafting.active()
                  ? crafting.selectedIds()
                  : undefined
            }
            compactMode={props.compactMode}
            marketPrices={marketPrices()}
            onSelectAsset={(assetId) => {
              const item = visibleItems().find(
                (candidate) => candidate.assetId === assetId,
              );
              if (tradeUp.active() && item) tradeUp.toggle(item);
              else if (crafting.active() && item) crafting.toggle(item);
              else props.setSelectedAssetId(assetId);
            }}
          />
          <Show
            when={
              (props.loading || snapshot()?.status === "loading") &&
              (snapshot()?.items.length ?? 0) === 0
            }
          >
            <InventoryLoadingState
              active
              title={`Loading ${title()}`}
              currentStage={snapshot()?.message}
            />
          </Show>
          <Show
            when={(snapshot()?.items.length ?? 0) > 0 && items().length === 0}
          >
            <p class="rounded-2xl border border-slate-800 p-5 text-sm text-slate-400">
              No matching items.
            </p>
          </Show>
        </PullToRefresh>
      </div>
      <TF2TradeUpConfirmationDialog
        open={tradeUp.confirmationOpen()}
        items={tradeUp.selectedItems()}
        outcomes={tradeUp.outcomes()}
        connected={props.connected === true}
        enabled={props.settings?.featureFlags.enableTf2Crafting ?? false}
        marketPrices={marketPrices()}
        scanPrices={props.onScanPrices}
        onOpenChange={tradeUp.setConfirmationOpen}
        onRemove={tradeUp.toggle}
        onExecute={(itemIds) =>
          submitTF2Operation("tf2.crafting.craft", {
            game: "tf2",
            itemIds,
            confirmed: true,
          })
        }
        onAccepted={() => {
          tradeUp.reset();
          props.onRefresh();
        }}
      />
      <TF2TradeUpConfirmationDialog
        open={crafting.confirmationOpen()}
        title={
          crafting.statClock()
            ? "Permanently craft a Civilian Grade Stat Clock?"
            : `Permanently submit ${crafting.recipe()?.name ?? "this recipe"}?`
        }
        description={
          crafting.statClock()
            ? "Five qualifying items will be consumed to create one Civilian Grade Stat Clock."
            : `${crafting.recipe()?.inputLabel ?? "The selected ingredients"} will be consumed to create ${crafting.recipe()?.outputName ?? "the recipe output"}.`
        }
        requiredCount={crafting.requiredCount()}
        items={crafting.selectedItems()}
        outcomes={[
          {
            name: crafting.statClock()
              ? "Civilian Grade Stat Clock"
              : (crafting.recipe()?.outputName ?? "TF2 crafting output"),
            poolKind: "primary",
            probability: 1,
            marketName: crafting.statClock()
              ? "Civilian Grade Stat Clock"
              : crafting.recipe()?.outputName,
          },
        ]}
        connected={props.connected === true}
        enabled={props.settings?.featureFlags.enableTf2Crafting ?? false}
        protocolWarning={crafting.statClock() ? "" : undefined}
        marketPrices={marketPrices()}
        scanPrices={props.onScanPrices}
        onOpenChange={crafting.setConfirmationOpen}
        onRemove={crafting.toggle}
        onExecute={(itemIds) =>
          submitTF2Operation(
            crafting.statClock()
              ? "tf2.crafting.stat-clock"
              : "tf2.crafting.craft",
            {
              game: "tf2",
              itemIds,
              recipeId: crafting.recipe()?.id,
              confirmed: true,
            },
          )
        }
        onAccepted={() => {
          crafting.reset();
          props.onRefresh();
        }}
      />
      <RevealAnimation
        open={!!tf2ContainerPreview()}
        ready
        mode={props.settings?.animations?.container ?? "slot-machine"}
        title="TF2 unboxing preview"
        candidates={tf2ContainerPreview()?.candidates ?? []}
        result={tf2ContainerPreview()?.result ?? { name: "TF2 item" }}
        onComplete={() => setTF2ContainerPreview(undefined)}
      />
    </div>
  );
}
