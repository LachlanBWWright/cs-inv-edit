import { createMemo, createSignal, onMount } from "solid-js";
import {
  buildStickerPlan,
  buildTradeUpPlan,
  loadDashboardData,
  prepareStorageMove,
} from "./dashboard-service";
import type {
  ActivityEvent,
  DashboardData,
  InventoryItem,
  StatusFlag,
} from "./types";
import { AppDashboard, type Notice } from "./AppDashboard";

type Summary<T> = {
  kind: "ok" | "err";
  message: string;
  value?: T;
};

const toneClasses: Record<StatusFlag["tone"], string> = {
  Stable: "border-emerald-400/30 bg-emerald-500/10 text-emerald-200",
  Watch: "border-amber-400/30 bg-amber-500/10 text-amber-100",
  Risk: "border-rose-400/30 bg-rose-500/10 text-rose-100",
};

const readinessClasses: Record<InventoryItem["readiness"], string> = {
  Ready:
    "bg-emerald-500/15 text-emerald-200 ring-1 ring-inset ring-emerald-400/20",
  Review: "bg-amber-500/15 text-amber-100 ring-1 ring-inset ring-amber-400/20",
  Blocked: "bg-rose-500/15 text-rose-100 ring-1 ring-inset ring-rose-400/20",
};

const activityClasses: Record<ActivityEvent["status"], string> = {
  Completed: "bg-emerald-500/15 text-emerald-200",
  Queued: "bg-sky-500/15 text-sky-100",
  Review: "bg-amber-500/15 text-amber-100",
};

const platformLabel = (() => {
  if (window.desktopShell?.isDesktop === true) {
    return `Desktop shell · ${window.desktopShell.platform}`;
  }

  return "Web shell · responsive review mode";
})();

const createReviewEvent = (title: string, detail: string): ActivityEvent => ({
  id: `activity-${crypto.randomUUID()}`,
  title,
  detail,
  status: "Queued",
  timestamp: "just now",
});

function App() {
  const [dashboard, setDashboard] = createSignal<DashboardData>();
  const [selectedItemId, setSelectedItemId] = createSignal<string>("");
  const [tradeUpQueue, setTradeUpQueue] = createSignal<string[]>([]);
  const [selectedStorageId, setSelectedStorageId] = createSignal<string>("");
  const [collectionFilter, setCollectionFilter] = createSignal<string>("All");
  const [stickerPreset, setStickerPreset] = createSignal<string>(
    "Precision alignment",
  );
  const [notice, setNotice] = createSignal<Notice>({
    tone: "info",
    message: "Loading backend-backed inventory data…",
  });

  onMount(() => {
    void loadDashboardData().then(([data, error]) => {
      if (error !== null) {
        setNotice({ tone: "warning", message: error.message });
        return;
      }

      if (data !== null) {
        setDashboard(data);
        setSelectedItemId(data.inventory[0]?.id ?? "");
        setTradeUpQueue(data.recommendedTradeUpIds);
        setSelectedStorageId(data.storageUnits[0]?.id ?? "");
        setNotice({
          tone: "success",
          message: "Dashboard ready.",
        });
      }
    });
  });

  const selectedItem = createMemo(() =>
    dashboard()?.inventory.find((item) => item.id === selectedItemId()),
  );
  const selectedStorage = createMemo(() =>
    dashboard()?.storageUnits.find((unit) => unit.id === selectedStorageId()),
  );

  const filteredInventory = createMemo(() => {
    const data = dashboard();

    if (data === undefined) {
      return [];
    }

    const filter = collectionFilter();

    if (filter === "All") {
      return data.inventory;
    }

    return data.inventory.filter((item) => item.collection === filter);
  });

  const tradeUpItems = createMemo(() => {
    const data = dashboard();

    if (data === undefined) {
      return [];
    }

    return tradeUpQueue()
      .map((id) => data.inventory.find((item) => item.id === id))
      .filter((item): item is InventoryItem => item !== undefined);
  });

  const tradeUpPlan = createMemo(() => buildTradeUpPlan(tradeUpItems()));
  const stickerPlan = createMemo(() => {
    const item = selectedItem();

    return item === undefined
      ? undefined
      : buildStickerPlan(item, stickerPreset());
  });
  const storagePlan = createMemo(() => {
    const item = selectedItem();
    const storageUnit = selectedStorage();

    if (item === undefined || storageUnit === undefined) {
      return undefined;
    }

    return prepareStorageMove(item, storageUnit);
  });

  const stickerPlanSummary = createMemo<
    Summary<{ confidence: string; notes: string[] }> | undefined
  >(() => {
    const plan = stickerPlan()?.match(
      (value) => ({ kind: "ok" as const, message: value.confidence, value }),
      (error) => ({
        kind: "err" as const,
        message: error.message,
        value: undefined,
      }),
    );

    return plan === undefined ? undefined : plan;
  });

  const tradeUpPlanSummary = createMemo<
    | Summary<{
        collection: string;
        averageWear: string;
        predictedTier: string;
        outputTheme: string;
      }>
    | undefined
  >(() => {
    const plan = tradeUpPlan().match(
      (value) => ({ kind: "ok" as const, message: value.predictedTier, value }),
      (error) => ({
        kind: "err" as const,
        message: error.message,
        value: undefined,
      }),
    );

    return plan;
  });

  const storagePlanSummary = createMemo<
    Summary<{ summary: string; targetFreeSlots: number }> | undefined
  >(() => {
    const plan = storagePlan()?.match(
      (value) => ({ kind: "ok" as const, message: value.summary, value }),
      (error) => ({
        kind: "err" as const,
        message: error.message,
        value: undefined,
      }),
    );

    return plan === undefined ? undefined : plan;
  });

  const appendActivity = (event: ActivityEvent): void => {
    const current = dashboard();

    if (current === undefined) {
      return;
    }

    setDashboard({
      ...current,
      activity: [event, ...current.activity].slice(0, 6),
    });
  };

  const handleTradeUpToggle = (itemId: string): void => {
    const currentQueue = tradeUpQueue();
    const alreadyQueued = currentQueue.includes(itemId);

    if (alreadyQueued) {
      setTradeUpQueue(currentQueue.filter((id) => id !== itemId));
      return;
    }

    if (currentQueue.length >= 10) {
      setNotice({
        tone: "warning",
        message: "Trade-up review baskets cap at 10 items.",
      });
      return;
    }

    setTradeUpQueue([...currentQueue, itemId]);
  };

  const handleStickerReview = (): void => {
    const plan = stickerPlan()?.match(
      (value) => ({ kind: "ok" as const, value }),
      (error) => ({ kind: "err" as const, error }),
    );

    if (plan === undefined) {
      setNotice({
        tone: "warning",
        message: "Select an item before opening sticker review.",
      });
      return;
    }

    if (plan.kind === "err") {
      setNotice({ tone: "warning", message: plan.error.message });
      return;
    }

    setNotice({
      tone: "success",
      message: `${plan.value.preset} queued for manual review.`,
    });
    appendActivity(
      createReviewEvent(
        "Sticker refinement queued",
        plan.value.notes[0] ?? "Review staged.",
      ),
    );
  };

  const handleStorageReview = (): void => {
    const plan = storagePlan()?.match(
      (value) => ({ kind: "ok" as const, value }),
      (error) => ({ kind: "err" as const, error }),
    );

    if (plan === undefined) {
      setNotice({
        tone: "warning",
        message: "Select an item and storage unit before reviewing the move.",
      });
      return;
    }

    if (plan.kind === "err") {
      setNotice({ tone: "warning", message: plan.error.message });
      return;
    }

    setNotice({ tone: "success", message: plan.value.summary });
    appendActivity(
      createReviewEvent("Storage move reserved", plan.value.summary),
    );
  };

  const handleTradeUpReview = (): void => {
    const plan = tradeUpPlan().match(
      (value) => ({ kind: "ok" as const, value }),
      (error) => ({ kind: "err" as const, error }),
    );

    if (plan.kind === "err") {
      setNotice({ tone: "warning", message: plan.error.message });
      return;
    }

    setNotice({
      tone: "success",
      message: `${plan.value.predictedTier} review staged for ${plan.value.collection}.`,
    });
    appendActivity(
      createReviewEvent("Trade-up basket reviewed", plan.value.outputTheme),
    );
  };

  const metricCards = createMemo(() => {
    const data = dashboard();

    if (data === undefined) {
      return [];
    }

    const readyCount = data.inventory.filter(
      (item) => item.readiness === "Ready",
    ).length;
    const storageOccupancy = data.storageUnits.reduce(
      (sum, unit) => sum + unit.occupied,
      0,
    );
    const storageCapacity = data.storageUnits.reduce(
      (sum, unit) => sum + unit.capacity,
      0,
    );

    return [
      {
        label: "Tracked items",
        value: `${data.inventory.length}`,
        detail: "Placeholder inventory cards for visual QA",
      },
      {
        label: "Ready actions",
        value: `${readyCount}`,
        detail: "Safe review pathways surfaced before mutation",
      },
      {
        label: "Storage usage",
        value: `${Math.round((storageOccupancy / storageCapacity) * 100)}%`,
        detail: "Capacity pressure shown before routing items",
      },
      {
        label: "Session start",
        value: data.sessionStartedAt.slice(11, 16) + " UTC",
        detail: "Started from the recorded implementation timestamp",
      },
    ];
  });

  const noticeClasses = createMemo(() => {
    const current = notice().tone;

    if (current === "success") {
      return "border-emerald-400/30 bg-emerald-500/10 text-emerald-100";
    }

    if (current === "warning") {
      return "border-amber-400/30 bg-amber-500/10 text-amber-50";
    }

    return "border-sky-400/30 bg-sky-500/10 text-sky-100";
  });

  const workflowCards = createMemo(() => {
    const data = dashboard();

    if (data === undefined) {
      return [];
    }

    const readyCount = data.inventory.filter(
      (item) => item.readiness === "Ready",
    ).length;
    const blockedCount = data.inventory.filter(
      (item) => item.readiness === "Blocked",
    ).length;
    const totalCapacity = data.storageUnits.reduce(
      (sum, unit) => sum + unit.capacity,
      0,
    );
    const occupiedCapacity = data.storageUnits.reduce(
      (sum, unit) => sum + unit.occupied,
      0,
    );
    const queueCount = tradeUpQueue().length;

    return [
      {
        label: "Selected item",
        value: selectedItem()?.name ?? "Awaiting choice",
        detail:
          selectedItem() === undefined
            ? "Pick an inventory card to inspect its context."
            : `${selectedItem()?.finish ?? "Item"} · ${selectedItem()?.wearLabel ?? "Wear pending"}`,
      },
      {
        label: "Trade-up queue",
        value: `${queueCount}/10`,
        detail:
          queueCount === 10
            ? "Basket is full and ready for review."
            : `${10 - queueCount} slot${queueCount === 9 ? "" : "s"} left to reach the review basket.`,
      },
      {
        label: "Storage pressure",
        value: `${Math.round((occupiedCapacity / totalCapacity) * 100)}%`,
        detail: `${occupiedCapacity}/${totalCapacity} slots occupied across the route map.`,
      },
      {
        label: "Ready actions",
        value: `${readyCount}`,
        detail: `${blockedCount} item${blockedCount === 1 ? "" : "s"} need extra review before routing.`,
      },
    ];
  });

  const nextBestAction = createMemo(() => {
    if (selectedItem() !== undefined) {
      return {
        title: `Inspect ${selectedItem()?.name ?? "the selected item"} in the focused panel`,
        detail:
          "The detail rail now acts as a decision surface, surfacing wear, sticker count, and route state before you commit to a review or move.",
      };
    }

    if (tradeUpQueue().length > 0) {
      return {
        title: "Stage the queued basket for a review pass",
        detail:
          "Continue grouping the current selection until the trade-up review card shows one coherent collection and rarity profile.",
      };
    }

    return {
      title: "Select an inventory card to start the review flow",
      detail:
        "The interface is designed to keep the most important actions visible from the first interaction, so the handoff between inspection and action stays effortless.",
    };
  });

  return (
    <AppDashboard
      dashboard={dashboard()}
      platformLabel={platformLabel}
      notice={notice()}
      noticeClasses={noticeClasses()}
      metricCards={metricCards()}
      workflowCards={workflowCards()}
      nextBestAction={nextBestAction()}
      collectionFilter={collectionFilter()}
      onCollectionFilterChange={setCollectionFilter}
      filteredInventory={filteredInventory()}
      selectedItemId={selectedItemId()}
      onSelectItem={setSelectedItemId}
      tradeUpQueue={tradeUpQueue()}
      onTradeUpToggle={handleTradeUpToggle}
      stickerPreset={stickerPreset()}
      onStickerPresetChange={setStickerPreset}
      stickerPlanSummary={stickerPlanSummary()}
      onStickerReview={handleStickerReview}
      tradeUpPlanSummary={tradeUpPlanSummary()}
      onTradeUpReview={handleTradeUpReview}
      storagePlanSummary={storagePlanSummary()}
      onStorageReview={handleStorageReview}
      selectedStorageId={selectedStorageId()}
      onSelectStorage={setSelectedStorageId}
      toneClasses={toneClasses}
      readinessClasses={readinessClasses}
      activityClasses={activityClasses}
    />
  );
}

export default App;
