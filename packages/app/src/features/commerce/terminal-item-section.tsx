import { Show, createEffect, createSignal } from "solid-js";
import type { InventoryItemDto, PurchaseSession } from "@cs-inv-edit/contracts";
import { isActiveTerminal } from "../inventory/inventory-view-utils.js";
import { terminalOfferLimit } from "./terminal-offer-limit.js";
import type { InventoryDetailsPanelProps } from "../inventory/InventoryDetailsPanel.js";
import { TerminalOfferCard } from "./terminal-offer-card.js";

function TerminalOfferPanel(props: {
  selected: InventoryItemDto;
  panelProps: InventoryDetailsPanelProps;
  currentTerminalOffer: () => NonNullable<InventoryItemDto["terminalOffers"]>[number] | undefined;
  terminalOfferLoading: () => boolean;
  knownOfferLimit: () => { state: "known"; isLastOffer: boolean; additionalOffers: number } | undefined;
  confirmTerminalReject: () => boolean;
  confirmTerminalPurchase: () => boolean;
  terminalPurchaseMessage: () => string;
  activeSession: () => PurchaseSession | undefined;
  onReject: () => void;
  onPurchase: () => void;
  onCancel: () => void;
  onConfirmReject: () => void;
  onConfirmPurchase: () => void;
}) {
  const fallbackMessage = () => {
    const state = props.panelProps.terminalOfferState;
    if (state?.terminalId === props.selected.id) return state.message;
    return "No current offer was returned by the CS2 Game Coordinator.";
  };

  return (
    <section class="rounded-2xl border border-violet-500/30 bg-violet-950 p-4">
      <h4 class="text-sm font-semibold text-violet-100">Current terminal offer</h4>
      <Show when={props.terminalOfferLoading()}>
        <p class="mt-2 text-sm text-amber-200">{props.panelProps.terminalOfferState!.message}</p>
      </Show>
      <Show
        when={props.currentTerminalOffer()}
        fallback={<p class={`mt-2 text-sm ${props.panelProps.terminalOfferState?.state === "error" ? "text-rose-200" : "text-amber-200"}`}>{fallbackMessage()}</p>}
      >
        {(offer) => (
          <TerminalOfferCard
            offer={offer()}
            offerLimit={props.knownOfferLimit()}
            loading={props.terminalOfferLoading()}
            pending={props.panelProps.pending}
            confirmReject={props.confirmTerminalReject()}
            confirmPurchase={props.confirmTerminalPurchase()}
            purchaseMessage={props.terminalPurchaseMessage}
            containerStatusMessage={props.panelProps.containerStatusMessage}
            session={props.activeSession}
            onReject={props.onReject}
            onPurchase={props.onPurchase}
            onCancel={props.onCancel}
            onConfirmReject={props.onConfirmReject}
            onConfirmPurchase={props.onConfirmPurchase}
          />
        )}
      </Show>
    </section>
  );
}

export function TerminalItemSection(props: {
  selected: InventoryItemDto;
  panelProps: InventoryDetailsPanelProps;
}) {
  const [confirmTerminalPurchase, setConfirmTerminalPurchase] = createSignal(false);
  const [confirmTerminalReject, setConfirmTerminalReject] = createSignal(false);
  const [terminalPurchaseMessage, setTerminalPurchaseMessage] = createSignal("");
  const [activeSession, setActiveSession] = createSignal<PurchaseSession>();

  createEffect(() => {
    void props.selected.id;
    void currentTerminalOffer()?.fauxItemId;
    setConfirmTerminalPurchase(false);
    setConfirmTerminalReject(false);
    setTerminalPurchaseMessage("");
    setActiveSession(undefined);
  });

  const terminalOffers = () => props.selected.terminalOffers ?? [];
  const currentTerminalOffer = () => terminalOffers()[0];
  const terminalOfferLoading = () =>
    props.panelProps.terminalOfferState?.terminalId === props.selected.id &&
    props.panelProps.terminalOfferState.state === "loading";
  const offerLimit = () => terminalOfferLimit(props.selected.terminalPointsRemaining);
  const knownOfferLimit = () => {
    const limit = offerLimit();
    return limit.state === "known" ? limit : undefined;
  };
  const rejectTerminalOffer = () => {
    setConfirmTerminalPurchase(false);
    setConfirmTerminalReject(false);
    setActiveSession(undefined);
    void props.panelProps.onOpenContainer({
      pointsRemaining: props.selected.terminalPointsRemaining ?? 0,
    });
  };
  const purchaseTerminalOffer = async () => {
    const offer = currentTerminalOffer();
    if (!offer?.purchasePrice) {
      console.warn(
        "[purchaseTerminalOffer] Offer purchase price is missing or 0:",
        offer,
      );
      return;
    }
    console.log("[purchaseTerminalOffer] Initiating terminal offer purchase:", {
      terminalId: props.selected.id,
      offerId: `terminal:${props.selected.id}`,
      purchasePrice: offer.purchasePrice,
      offerItem: offer.item,
    });
    const session = await props.panelProps.onTerminalPurchase({
      offerId: `terminal:${props.selected.id}`,
      quantity: 1,
      expectedPriceSheetVersion: 0,
      expectedAmountMinor: offer.purchasePrice,
      supplementalData: props.selected.id,
      expectedTerminalOfferItemId: offer.fauxItemId,
    });
    console.log(
      "[purchaseTerminalOffer] Received purchase session response from backend:",
      session,
    );
    if (session.status === "failed") {
      console.error(
        "[purchaseTerminalOffer] Purchase initialization failed:",
        session.message,
        session.diagnostics,
      );
    }
    setActiveSession(session);
    setTerminalPurchaseMessage(session.message ?? session.status);
    if (session.checkoutUrl) {
      console.log(
        "[purchaseTerminalOffer] Opening Steam checkout URL:",
        session.checkoutUrl,
      );
      window.open(session.checkoutUrl, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <Show when={isActiveTerminal(props.selected)}>
      <TerminalOfferPanel
        selected={props.selected}
        panelProps={props.panelProps}
        currentTerminalOffer={currentTerminalOffer}
        terminalOfferLoading={terminalOfferLoading}
        knownOfferLimit={knownOfferLimit}
        confirmTerminalReject={() => confirmTerminalReject()}
        confirmTerminalPurchase={() => confirmTerminalPurchase()}
        terminalPurchaseMessage={() => terminalPurchaseMessage()}
        activeSession={() => activeSession()}
        onReject={rejectTerminalOffer}
        onPurchase={() => void purchaseTerminalOffer()}
        onCancel={() => {
          setConfirmTerminalPurchase(false);
          setConfirmTerminalReject(false);
        }}
        onConfirmReject={() => {
          setConfirmTerminalPurchase(false);
          setConfirmTerminalReject(true);
        }}
        onConfirmPurchase={() => {
          setConfirmTerminalReject(false);
          setConfirmTerminalPurchase(true);
        }}
      />
    </Show>
  );
}
