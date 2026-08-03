import { Show, createEffect, createSignal } from "solid-js";
import type { InventoryItemDto, PurchaseSession } from "@cs-inv-edit/contracts";
import { Button } from "../../shared/ui/Button.js";
import { isActiveTerminal, rarityBorderClass, rarityDisplayLabel } from "../inventory/inventory-view-utils.js";
import { WearRangeBar } from "../../shared/ui/WearRangeBar.js";
import { terminalOfferLimit } from "./terminal-offer-limit.js";
import type { InventoryDetailsPanelProps } from "../inventory/InventoryDetailsPanel.js";

export function TerminalItemSection(props: { selected: InventoryItemDto; panelProps: InventoryDetailsPanelProps }) {
  const [confirmTerminalPurchase, setConfirmTerminalPurchase] =
    createSignal(false);
  const [confirmTerminalReject, setConfirmTerminalReject] = createSignal(false);
  const [terminalPurchaseMessage, setTerminalPurchaseMessage] =
    createSignal("");
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
  const offerLimit = () =>
    terminalOfferLimit(props.selected.terminalPointsRemaining);
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
    <>
      <Show when={isActiveTerminal(props.selected)}>
        <section class="rounded-2xl border border-violet-500/30 bg-violet-950 p-4">
          <h4 class="text-sm font-semibold text-violet-100">
            Current terminal offer
          </h4>
          <Show when={terminalOfferLoading()}>
            <p class="mt-2 text-sm text-amber-200">
              {props.panelProps.terminalOfferState!.message}
            </p>
          </Show>
          <Show
            when={currentTerminalOffer()}
            fallback={
              <p
                class={`mt-2 text-sm ${props.panelProps.terminalOfferState?.state === "error" ? "text-rose-200" : "text-amber-200"}`}
              >
                {props.panelProps.terminalOfferState?.terminalId ===
                props.selected.id
                  ? props.panelProps.terminalOfferState.message
                  : "No current offer was returned by the CS2 Game Coordinator."}
              </p>
            }
          >
            {(offer) => (
              <>
                <div
                  class={`mt-3 flex items-center gap-3 rounded-xl bg-slate-900 p-3 ${rarityBorderClass(offer().item.rarity)}`}
                >
                  <Show
                    when={offer().item.imageUrl}
                    fallback={
                      <div class="grid h-20 w-24 place-items-center rounded-xl bg-slate-950 text-slate-600">
                        ?
                      </div>
                    }
                  >
                    {(imageUrl) => (
                      <img
                        class="h-20 w-24 rounded-xl bg-slate-950 object-contain p-1"
                        src={imageUrl()}
                        alt=""
                      />
                    )}
                  </Show>
                  <div class="min-w-0 flex-1">
                    <p class="font-semibold text-slate-100 truncate">
                      {offer().item.marketName || offer().item.name}
                    </p>
                    <p class="mt-1 text-xs text-slate-400">
                      <span class="font-medium text-slate-300">
                        {rarityDisplayLabel(offer().item.rarity) ||
                          "Unknown rarity"}
                      </span>
                      <Show
                        when={
                          offer().item.paintWear !== undefined
                            ? offer().item.paintWear
                            : undefined
                        }
                      >
                        {(wear) => (
                          <span class="ml-1 text-slate-400">
                            · Float:{" "}
                            <span class="font-mono font-medium text-slate-200">
                              {wear().toString()}
                            </span>
                          </span>
                        )}
                      </Show>
                      <Show
                        when={
                          offer().purchasePrice
                            ? (offer().purchasePrice! / 100).toLocaleString(
                                "en-US",
                                { style: "currency", currency: "USD" },
                              )
                            : undefined
                        }
                      >
                        {(price) => ` · Price ${price()}`}
                      </Show>
                    </p>
                  </div>
                </div>
                <Show
                  when={
                    offer().item.paintWear !== undefined
                      ? offer().item.paintWear
                      : undefined
                  }
                >
                  {(wear) => (
                    <div class="mt-3">
                      <WearRangeBar
                        wear={wear()}
                        min={offer().item.wearMin}
                        max={offer().item.wearMax}
                      />
                    </div>
                  )}
                </Show>
                <Show when={offer().item.inspectUrl}>
                  {(inspectUrl) => (
                    <div class="mt-3">
                      <a
                        class="block w-full rounded-xl border border-cyan-500/40 bg-cyan-950 px-3 py-2 text-center text-xs font-semibold text-cyan-100 hover:bg-cyan-950"
                        href={inspectUrl()}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Inspect offer in game ↗
                      </a>
                    </div>
                  )}
                </Show>
                <div
                  class={`mt-3 rounded-xl border px-3 py-2 ${
                    knownOfferLimit()?.isLastOffer
                      ? "border-rose-500/40 bg-rose-950"
                      : "border-violet-500/30 bg-slate-950"
                  }`}
                >
                  <Show
                    when={
                      knownOfferLimit()
                    }
                    fallback={
                      <>
                        <p class="text-xs font-semibold text-amber-200">
                          Offer limit unavailable
                        </p>
                        <p class="mt-1 text-xs text-slate-400">
                          CS2 returned an invalid or unknown remaining-offer
                          counter. Refresh the terminal before rejecting this
                          offer.
                        </p>
                      </>
                    }
                  >
                    {(limit) => (
                      <Show
                        when={!limit().isLastOffer}
                        fallback={
                          <>
                            <p class="text-xs font-semibold text-rose-200">
                              Final offer
                            </p>
                            <p class="mt-1 text-xs text-slate-300">
                              This is the terminal&apos;s last offer. It cannot
                              be rejected for another item.
                            </p>
                          </>
                        }
                      >
                        <p class="text-xs font-semibold text-violet-100">
                          {limit().additionalOffers}{" "}
                          {limit().additionalOffers === 1
                            ? "offer remains"
                            : "offers remain"}{" "}
                          after this one
                        </p>
                        <p class="mt-1 text-xs text-slate-400">
                          Rejecting permanently discards this offer and leaves{" "}
                          {limit().additionalOffers} more{" "}
                          {limit().additionalOffers === 1 ? "offer" : "offers"}{" "}
                          available.
                        </p>
                      </Show>
                    )}
                  </Show>
                </div>
                <div class="mt-4 flex flex-wrap gap-2">
                  <Show
                    when={!confirmTerminalReject()}
                    fallback={
                      <>
                        <Button
                          variant="danger"
                          disabled={
                            props.panelProps.pending || terminalOfferLoading()
                          }
                          onClick={rejectTerminalOffer}
                        >
                          Confirm rejection · Show next offer
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={() => setConfirmTerminalReject(false)}
                        >
                          Keep this offer
                        </Button>
                      </>
                    }
                  >
                    <Button
                      variant="secondary"
                      disabled={
                        props.panelProps.pending ||
                        terminalOfferLoading() ||
                        !knownOfferLimit() ||
                        knownOfferLimit()?.isLastOffer
                      }
                      onClick={() => {
                        setConfirmTerminalPurchase(false);
                        setConfirmTerminalReject(true);
                      }}
                    >
                      {knownOfferLimit()?.isLastOffer
                        ? "Final offer"
                        : "Reject · Next offer"}
                    </Button>
                  </Show>
                  <Show
                    when={!confirmTerminalPurchase()}
                    fallback={
                      <>
                        <Button
                          disabled={
                            props.panelProps.pending ||
                            terminalOfferLoading() ||
                            !offer().purchasePrice
                          }
                          onClick={() => void purchaseTerminalOffer()}
                        >
                          Confirm purchase from Steam Wallet
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={() => setConfirmTerminalPurchase(false)}
                        >
                          Cancel
                        </Button>
                      </>
                    }
                  >
                    <Button
                      disabled={
                        props.panelProps.pending || terminalOfferLoading()
                      }
                      onClick={() => setConfirmTerminalPurchase(true)}
                    >
                      Buy this offer
                    </Button>
                  </Show>
                </div>
                <Show when={confirmTerminalReject()}>
                  <p class="mt-2 text-xs font-medium text-rose-200">
                    This cannot be undone. The current item will no longer be
                    available from this terminal.
                  </p>
                </Show>
                <Show when={confirmTerminalPurchase()}>
                  <p class="mt-2 text-xs text-amber-200">
                    This is a real purchase and will charge your Steam Wallet
                    upon authorization on Steam. Like in CS2, accepting the
                    offer opens Steam to complete the microtransaction.
                  </p>
                </Show>
                <Show when={activeSession()?.checkoutUrl}>
                  {(checkoutUrl) => (
                    <div class="mt-3 rounded-xl border border-emerald-500/40 bg-emerald-950 p-3">
                      <p class="font-semibold text-emerald-200 text-xs">
                        Steam Microtransaction Link Ready
                      </p>
                      <p class="mt-1 text-xs text-slate-300">
                        Click below to finalize and approve this purchase on
                        Steam:
                      </p>
                      <a
                        class="mt-2 inline-block rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500"
                        href={checkoutUrl()}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Open Steam Checkout ↗
                      </a>
                    </div>
                  )}
                </Show>
                <Show when={terminalPurchaseMessage()}>
                  <p class="mt-2 text-xs text-slate-300">
                    {terminalPurchaseMessage()}
                  </p>
                </Show>
                <Show when={props.panelProps.containerStatusMessage}>
                  <p class="mt-2 text-xs text-slate-300">
                    {props.panelProps.containerStatusMessage}
                  </p>
                </Show>
              </>
            )}
          </Show>
        </section>
      </Show>
    </>
  );
}
