import type { Accessor, Setter } from "solid-js";
import type { InventoryItemDto } from "@cs-inv-edit/contracts";
import type { RevealItem } from "../../shared/ui/RevealAnimation.js";
import { itemDisplayName } from "./inventory-view-utils.js";
import { isOpenableContainer, isTerminal } from "./inventory-view-utils.js";
import { appErrorMessage, fromAppPromise } from "../../shared/lib/result.js";
import type { InventoryViewProps } from "./InventoryView.js";

type ContainerReveal = {
  result: RevealItem;
  ready: boolean;
  candidates: RevealItem[];
  complete: () => void;
};

interface OpenContainerContext {
  props: InventoryViewProps;
  selectedItem: Accessor<InventoryItemDto | undefined>;
  compatibleContainerKey: Accessor<InventoryItemDto | undefined>;
  compatibleContainerKeys: Accessor<InventoryItemDto[]>;
  connected: Accessor<boolean>;
  setContainerStatusMessage: Setter<string>;
  setPending: Setter<boolean>;
  setReveal: Setter<ContainerReveal | undefined>;
}

type ReceiptResultPayload = {
  openedItem?: InventoryItemDto;
  terminalOffer?: NonNullable<InventoryItemDto["terminalOffers"]>[number];
  offer?: NonNullable<InventoryItemDto["terminalOffers"]>[number]["item"];
  terminalItemId?: string;
};

function resolveReceiptResultPayload(
  receipt: import("@cs-inv-edit/contracts").OperationReceipt,
): ReceiptResultPayload | undefined {
  const payload = receipt.result;
  if (!payload) return undefined;
  return {
    openedItem: payload.openedItem,
    terminalOffer: payload.terminalOffer,
    offer: payload.offer,
    terminalItemId: payload.terminalItemId,
  };
}

function createRevealResult(
  openedItem: InventoryItemDto | undefined,
  resolvedTerminalOffer:
    NonNullable<InventoryItemDto["terminalOffers"]>[number]["item"] | undefined,
): RevealItem | undefined {
  if (resolvedTerminalOffer) {
    return {
      name: resolvedTerminalOffer.marketName || resolvedTerminalOffer.name,
      marketName: resolvedTerminalOffer.marketName,
      price: resolvedTerminalOffer.price,
      imageUrl: resolvedTerminalOffer.imageUrl,
      rarity: resolvedTerminalOffer.rarity,
      kind: resolvedTerminalOffer.kind,
      wear: resolvedTerminalOffer.paintWear,
      wearMin: resolvedTerminalOffer.wearMin,
      wearMax: resolvedTerminalOffer.wearMax,
    };
  }
  if (!openedItem) {
    return undefined;
  }
  return {
    name: itemDisplayName(openedItem),
    marketName: openedItem.marketName,
    price: openedItem.marketPrice,
    imageUrl: openedItem.imageUrl,
    rarity: openedItem.rarity,
    kind: openedItem.kind,
    wear: openedItem.paintWear,
    wearMin: openedItem.paintWearMin,
    wearMax: openedItem.paintWearMax,
    isStatTrak: openedItem.isStatTrak,
    isSouvenir: openedItem.isSouvenir,
  };
}

export function containerOpeningUsesReveal(
  animationMode: "none" | "countdown" | "slot-machine",
): boolean {
  return animationMode !== "none";
}

export function createOpenContainerHandler(context: OpenContainerContext) {
  const {
    props,
    selectedItem,
    compatibleContainerKey,
    compatibleContainerKeys,
    connected,
    setContainerStatusMessage,
    setPending,
    setReveal,
  } = context;
  const awaitReveal = (result: RevealItem, candidates: RevealItem[]) =>
    new Promise<void>((resolve) =>
      setReveal({ result, ready: true, candidates, complete: resolve }),
    );
  return async (terminalSelection?: {
    pointsRemaining?: number;
    volatileLimit?: number;
  }) => {
    const item = selectedItem();
    if (!item) return;
    if (!connected()) {
      const message = "Connect to Steam before opening containers.";
      setContainerStatusMessage(message);
      return;
    }
    if (!isOpenableContainer(item)) {
      const message = "Selected item is not a container or capsule.";
      setContainerStatusMessage(message);
      return;
    }
    if (
      (item.requiredKeyDefIndexes?.length ?? 0) > 0 &&
      !compatibleContainerKey()
    ) {
      setContainerStatusMessage(
        compatibleContainerKeys().length > 0
          ? "Select a compatible key before opening this container."
          : "This container requires a compatible key, but none is present in your inventory.",
      );
      return;
    }
    setPending(true);
    setContainerStatusMessage("Sending open request to CS2...");
    const keyItemId = compatibleContainerKey()?.id;
    const isWeaponCase =
      /\bcase\b/i.test(`${item.name} ${item.marketName ?? ""}`) &&
      !item.isSouvenir;
    const isSouvenirPackage = /souvenir.*package|package.*souvenir/i.test(
      `${item.name} ${item.marketName ?? ""}`,
    );
    const candidates = (item.containerItems ?? []).map((candidate) => ({
      name: candidate.marketName || candidate.name,
      marketName: candidate.marketName,
      price: candidate.price,
      imageUrl: candidate.imageUrl,
      rarity: candidate.rarity,
      kind: candidate.kind,
      wear: candidate.paintWear,
      wearMin: candidate.wearMin,
      wearMax: candidate.wearMax,
      supportsStatTrak: isWeaponCase && candidate.kind === "weapon_skin",
      supportsSouvenir: isSouvenirPackage && candidate.kind === "weapon_skin",
    }));
    const terminal = isTerminal(item);
    const animationMode = terminal
      ? (props.settings?.animations?.terminal ?? "slot-machine")
      : (props.settings?.animations?.container ?? "slot-machine");
    if (containerOpeningUsesReveal(animationMode))
      setReveal({
        result: candidates[0] ?? { name: "Awaiting item…" },
        ready: false,
        candidates,
        complete: () => undefined,
      });
    await fromAppPromise(
      props.containerActions.open(
        {
          itemId: item.id,
          ...(keyItemId ? { keyItemId } : {}),
          ...(terminal ? terminalSelection : {}),
        },
        terminal,
      ),
      terminal
        ? "Failed to generate terminal offer"
        : "Failed to open container",
    ).match(
      async (receipt) => {
        if (
          receipt.state !== "completed" &&
          receipt.state !== "awaiting_gc_confirmation"
        ) {
          const message =
            receipt.message ?? "Container open request was not accepted.";
          const responseBody = receipt.result?.responseBodyHex
            ? ` Response body: ${receipt.result.responseBodyHex}`
            : "";
          setContainerStatusMessage(`${message}${responseBody}`);
        } else {
          const payload = resolveReceiptResultPayload(receipt);
          const openedItem = payload?.openedItem;
          const resolvedTerminalOffer =
            payload?.offer ?? payload?.terminalOffer?.item;
          const resolvedTerminalItemId = payload?.terminalItemId;
          const message = openedItem
            ? `Received ${itemDisplayName(openedItem)}.`
            : receipt.message
              ? receipt.message
              : "Container opened and inventory was reconciled.";
          const result = createRevealResult(openedItem, resolvedTerminalOffer);
          if (result) {
            if (containerOpeningUsesReveal(animationMode)) {
              await awaitReveal(result, candidates);
            }
          } else {
            setReveal(undefined);
          }
          setContainerStatusMessage(message);
          if (openedItem?.id) {
            props.setSelectedItemId(openedItem.id);
          } else if (resolvedTerminalItemId) {
            props.setSelectedItemId(resolvedTerminalItemId);
          }
        }
      },
      (error) => {
        setReveal(undefined);
        setContainerStatusMessage(
          appErrorMessage(error, "Failed to open container."),
        );
      },
    );
    setPending(false);
  };
}
