import type { Accessor, Setter } from "solid-js";
import type { InventoryItemDto } from "@cs-inv-edit/contracts";
import { containerItemOdds } from "./related-item-preview-utils.js";
import { expectedReturn, scanPriceMap, type ReturnEstimate } from "./roi-utils.js";
import type { RevealItem } from "./ui/RevealAnimation.js";
import { itemDisplayName } from "./inventory-view-utils.js";
import { isOpenableContainer, isTerminal } from "./inventory-view-utils.js";
import { appErrorMessage, fromAppPromise } from "../lib/result.js";
import type { InventoryViewProps } from "./InventoryView.js";

interface OpenContainerContext {
  props: InventoryViewProps;
  selectedItem: Accessor<InventoryItemDto | undefined>;
  compatibleContainerKey: Accessor<InventoryItemDto | undefined>;
  compatibleContainerKeys: Accessor<InventoryItemDto[]>;
  connected: Accessor<boolean>;
  setContainerStatusMessage: Setter<string>;
  setPending: Setter<boolean>;
  setContainerReturn: Setter<ReturnEstimate | undefined>;
  setContainerReturnLoading: Setter<boolean>;
  setReveal: Setter<{ result: RevealItem; ready: boolean; candidates: RevealItem[]; complete: () => void } | undefined>;
}

export function containerOpeningUsesReveal(
  animationMode: "none" | "countdown" | "slot-machine",
): boolean {
  return animationMode !== "none";
}

export function createOpenContainerHandler(context: OpenContainerContext) {
  const { props, selectedItem, compatibleContainerKey, compatibleContainerKeys, connected, setContainerStatusMessage, setPending, setContainerReturn, setContainerReturnLoading, setReveal } = context;
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
    setContainerReturn(undefined);
    const priceNames = [
      ...new Set(
        [
          ...(item.containerItems ?? []).map(
            (candidate) => candidate.marketName,
          ),
          item.marketName,
          compatibleContainerKey()?.marketName,
        ].filter((name): name is string => !!name),
      ),
    ];
    setContainerReturnLoading(priceNames.length > 0);
    if (priceNames.length > 0)
      void scanPriceMap(priceNames, props.onScanPrices).then((prices) => {
        const odds = containerItemOdds(item.containerItems ?? []);
        const cost =
          (prices.get(item.marketName ?? "") ?? 0) +
          (prices.get(compatibleContainerKey()?.marketName ?? "") ?? 0);
        setContainerReturn(
          expectedReturn(
            (item.containerItems ?? []).map((candidate) => ({
              marketName: candidate.marketName,
              probability: odds.get(candidate) ?? 0,
            })),
            prices,
            cost || undefined,
          ),
        );
        setContainerReturnLoading(false);
      });
    if (containerOpeningUsesReveal(animationMode))
      setReveal({
        result: candidates[0] ?? { name: "Awaiting item…" },
        ready: false,
        candidates,
        complete: () => undefined,
      });
    await fromAppPromise(
      props.onOpenContainer(
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
          typeof receipt === "object" &&
          receipt &&
          "state" in receipt &&
          receipt.state !== "completed" &&
          receipt.state !== "awaiting_gc_confirmation"
        ) {
          const message =
            "message" in receipt && typeof receipt.message === "string"
              ? receipt.message
              : "Container open request was not accepted.";
          const responseBody =
            "result" in receipt &&
            typeof receipt.result === "object" &&
            receipt.result &&
            "responseBodyHex" in receipt.result &&
            typeof receipt.result.responseBodyHex === "string"
              ? ` Response body: ${receipt.result.responseBodyHex}`
              : "";
          setContainerStatusMessage(`${message}${responseBody}`);
        } else {
          const openedItem =
            typeof receipt === "object" &&
            receipt &&
            "result" in receipt &&
            typeof receipt.result === "object" &&
            receipt.result &&
            "openedItem" in receipt.result
              ? (receipt.result.openedItem as InventoryItemDto | undefined)
              : undefined;
          const terminalOffer =
            typeof receipt === "object" &&
            receipt &&
            "result" in receipt &&
            typeof receipt.result === "object" &&
            receipt.result &&
            "terminalOffer" in receipt.result
              ? (receipt.result.terminalOffer as
                  | NonNullable<InventoryItemDto["terminalOffers"]>[number]
                  | undefined)
              : undefined;
          const resolvedTerminalOffer =
            typeof receipt === "object" &&
            receipt &&
            "result" in receipt &&
            typeof receipt.result === "object" &&
            receipt.result &&
            "offer" in receipt.result
              ? (receipt.result.offer as
                  | NonNullable<InventoryItemDto["terminalOffers"]>[number]["item"]
                  | undefined)
              : terminalOffer?.item;
          const resolvedTerminalItemId =
            typeof receipt === "object" &&
            receipt &&
            "result" in receipt &&
            typeof receipt.result === "object" &&
            receipt.result &&
            "terminalItemId" in receipt.result &&
            typeof receipt.result.terminalItemId === "string"
              ? receipt.result.terminalItemId
              : undefined;
          const message = openedItem
            ? `Received ${itemDisplayName(openedItem)}.`
            : typeof receipt === "object" &&
                receipt &&
                "message" in receipt &&
                typeof receipt.message === "string"
              ? receipt.message
              : "Container opened and inventory was reconciled.";
          if (openedItem || resolvedTerminalOffer) {
            const result = resolvedTerminalOffer
              ? {
                  name:
                    resolvedTerminalOffer.marketName ||
                    resolvedTerminalOffer.name,
                  marketName: resolvedTerminalOffer.marketName,
                  price: resolvedTerminalOffer.price,
                  imageUrl: resolvedTerminalOffer.imageUrl,
                  rarity: resolvedTerminalOffer.rarity,
                  kind: resolvedTerminalOffer.kind,
                  wear: resolvedTerminalOffer.paintWear,
                  wearMin: resolvedTerminalOffer.wearMin,
                  wearMax: resolvedTerminalOffer.wearMax,
                }
              : {
                  name: itemDisplayName(openedItem!),
                  marketName: openedItem!.marketName,
                  price: openedItem!.marketPrice,
                  imageUrl: openedItem!.imageUrl,
                  rarity: openedItem!.rarity,
                  kind: openedItem!.kind,
                  wear: openedItem!.paintWear,
                  wearMin: openedItem!.paintWearMin,
                  wearMax: openedItem!.paintWearMax,
                  isStatTrak: openedItem!.isStatTrak,
                  isSouvenir: openedItem!.isSouvenir,
                };
            if (containerOpeningUsesReveal(animationMode)) {
              await new Promise<void>((resolve) =>
                setReveal({
                  result,
                  ready: true,
                  candidates,
                  complete: resolve,
                }),
              );
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
