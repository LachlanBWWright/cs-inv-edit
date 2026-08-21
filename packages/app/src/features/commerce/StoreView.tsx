import { For, Show, createSignal } from "solid-js";
import type {
  InitializeStorePurchaseRequest,
  PurchaseSession,
  SettingsData,
  StoreSnapshot,
} from "@cs-inv-edit/contracts";
import { Alert } from "../../shared/ui/Alert.js";
import { Button } from "../../shared/ui/Button.js";
import { Dialog } from "../../shared/ui/Dialog.js";
import { StoreContentsDialog } from "./store-contents-dialog.js";
import { StoreHeader } from "./store-header.js";
import { StoreOfferCard } from "./store-offer-card.js";
import { filterStoreOffers, type CommerceSort } from "./commerce-view-utils.js";
import {
  CheckoutLink,
  PurchaseActivityLine,
  ProtocolTraceLines,
  PurchaseFailureCode,
  PurchaseRequestSummary,
  SteamTransactionLine,
} from "./store-purchase-dialog-elements.js";

type StoreOffer = StoreSnapshot["offers"][number];

function StoreOfferGrid(props: {
  offers: StoreOffer[];
  quantity: (offerId: string) => number;
  onOpenContents: (offer: StoreOffer) => void;
  onSetQuantity: (offerId: string, value: number) => void;
  onBuy: (offer: StoreOffer) => void;
  browseOnly?: boolean;
}) {
  return (
    <div class="grid w-full gap-4 md:grid-cols-2 2xl:grid-cols-3">
      <For each={props.offers}>
        {(offer) => (
          <StoreOfferCard
            offer={offer}
            quantity={props.quantity(offer.id)}
            onOpenContents={() => props.onOpenContents(offer)}
            onSetQuantity={(value) => props.onSetQuantity(offer.id, value)}
            onBuy={() => props.onBuy(offer)}
            browseOnly={props.browseOnly}
          />
        )}
      </For>
    </div>
  );
}

function StorePurchaseDialog(props: {
  open: boolean;
  selected?: StoreOffer;
  quantity: (offerId: string) => number;
  busy: boolean;
  purchaseEnabled: boolean;
  purchaseDetail: string;
  session?: PurchaseSession;
  outgoingTrace: string[];
  purchase: () => void;
  selectedUsesCouponFallback: boolean;
  gcAccepted: boolean;
  steamAuthorizationReceived: boolean;
  gameName: string;
  onClose: () => void;
  onSetQuantity: (offerId: string, value: number) => void;
  onCopyTrace: () => void;
}) {
  const authorizationFailed = () =>
    props.gcAccepted &&
    !props.steamAuthorizationReceived &&
    props.session?.status === "failed";
  return (
    <Dialog
      open={props.open}
      title="Confirm Steam purchase"
      description="Prepare a Steam-hosted page where you can review and authorize the purchase."
      onOpenChange={(open) => {
        if (!open && !props.busy) props.onClose();
      }}
    >
      <p class="text-sm text-slate-200">Item: {props.selected?.name}</p>
      <label class="mt-4 block text-sm">
        Quantity{" "}
        <input
          class="ml-2 w-20 rounded border border-slate-700 bg-slate-900 p-2"
          type="number"
          min="1"
          max="20"
          value={props.selected ? props.quantity(props.selected.id) : 1}
          onInput={(event) => {
            const offer = props.selected;
            if (offer)
              props.onSetQuantity(offer.id, Number(event.currentTarget.value));
          }}
        />
      </label>
      <p class="mt-4 font-semibold">
        Total:{" "}
        {props.selected
          ? `${props.selected.currency} ${(((props.selected.saleAmountMinor ?? props.selected.amountMinor ?? 0) * props.quantity(props.selected.id)) / 100).toFixed(2)}`
          : ""}
      </p>
      <p class="mt-2 text-xs text-slate-400">
        Payment is completed securely through Steam. This app never collects
        card details or auto-authorizes the transaction.
      </p>
      <Show when={props.busy}>
        <div class="mt-3 rounded-lg border border-cyan-900/60 bg-cyan-950 p-3">
          <p class="text-sm font-semibold text-cyan-200">
            Preparing the Steam purchase link…
          </p>
          <p class="mt-1 text-xs leading-5 text-slate-300">
            {props.purchaseDetail}
          </p>
          <p class="mt-2 text-xs text-slate-500">
            This app does not submit or authorize payment. The Steam page opens
            only after you click the resulting link.
          </p>
        </div>
      </Show>
      <Show when={props.session?.status === "failed"}>
        <Alert variant="danger" class="mt-3">
          <Show when={props.session?.errorCode}>
            <PurchaseFailureCode session={props.session!} />
          </Show>
          <p>{props.session?.message}</p>
        </Alert>
      </Show>
      <Show when={props.session?.status === "awaiting_user"}>
        <Alert variant="success" class="mt-3">
          <p>{props.session?.message}</p>
          <div class="mt-2 text-xs text-slate-300">
            <p>
              Item: {props.session?.name} × {props.session?.quantity}
            </p>
            <p>Total: {props.session?.formattedAmount}</p>
            <Show when={props.session?.transactionId}>
              <SteamTransactionLine
                transactionId={props.session!.transactionId!}
              />
            </Show>
          </div>
          <Show when={props.session?.checkoutUrl}>
            {(checkoutUrl) => <CheckoutLink url={checkoutUrl()} />}
          </Show>
          <p class="mt-2 text-xs text-slate-400">
            Nothing opens automatically. This link opens a new tab only when you
            click it.
          </p>
        </Alert>
      </Show>
      <Show when={props.busy || (props.session?.diagnostics?.length ?? 0) > 0}>
        <section class="mt-3 rounded-lg border border-slate-700 bg-slate-950 p-3">
          <h3 class="text-sm font-semibold text-slate-200">
            Purchase activity
          </h3>
          <div class="mt-3 space-y-2 text-sm text-slate-300">
            <Show
              when={!props.selectedUsesCouponFallback}
              fallback={
                <p>✓ Prepared Steam&apos;s browser checkout for this coupon.</p>
              }
            >
              <PurchaseRequestSummary
                selected={props.selected}
                quantity={props.quantity}
              />
            </Show>
            <Show when={props.busy}>
              <PurchaseActivityLine kind="waiting" gameName={props.gameName} />
            </Show>
            <Show when={props.gcAccepted}>
              <PurchaseActivityLine kind="accepted" gameName={props.gameName} />
            </Show>
            <Show when={authorizationFailed()}>
              <PurchaseActivityLine
                kind="authorization-failed"
                gameName={props.gameName}
              />
            </Show>
            <Show when={props.steamAuthorizationReceived}>
              <PurchaseActivityLine
                kind="authorized"
                gameName={props.gameName}
              />
            </Show>
          </div>
          <details class="mt-3 border-t border-slate-800 pt-3">
            <summary class="cursor-pointer text-xs font-medium text-slate-400">
              Raw protocol data (message IDs, enum values and hexadecimal bytes)
            </summary>
            <div class="mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-all rounded bg-black p-3 font-mono text-[11px] leading-5 text-slate-300">
              <ProtocolTraceLines
                lines={props.session?.diagnostics ?? props.outgoingTrace}
              />
            </div>
            <Button
              class="mt-3"
              variant="secondary"
              onClick={() => props.onCopyTrace()}
            >
              Copy raw trace
            </Button>
          </details>
        </section>
      </Show>
      <Show when={!props.purchaseEnabled}>
        <p class="mt-3 text-sm text-amber-300">
          Unlock confirmation by enabling Store Purchases in Settings.
        </p>
      </Show>
      <div class="mt-5 flex gap-2">
        <Show when={props.session?.status !== "awaiting_user"}>
          <Button
            disabled={props.busy || !props.purchaseEnabled}
            onClick={() => props.purchase()}
          >
            {props.busy ? "Preparing…" : "Prepare Steam link"}
          </Button>
        </Show>
        <Button
          variant="secondary"
          disabled={props.busy}
          onClick={() => props.onClose()}
        >
          {props.session?.status === "awaiting_user" ? "Close" : "Cancel"}
        </Button>
      </div>
    </Dialog>
  );
}

export function StoreView(props: {
  store?: StoreSnapshot;
  settings?: SettingsData;
  browseOnly?: boolean;
  gameName?: string;
  query?: string;
  categoryFilter?: string;
  sort?: CommerceSort;
  onPurchase: (
    input: InitializeStorePurchaseRequest,
  ) => Promise<PurchaseSession>;
  onReconcile: (id: string) => Promise<PurchaseSession>;
}) {
  const [selected, setSelected] = createSignal<StoreOffer>();
  const [contentsOffer, setContentsOffer] = createSignal<StoreOffer>();
  const [quantities, setQuantities] = createSignal<Record<string, number>>({});
  const [busy, setBusy] = createSignal(false);
  const [purchaseDetail, setPurchaseDetail] = createSignal("");
  const [outgoingTrace, setOutgoingTrace] = createSignal<string[]>([]);
  const [session, setSession] = createSignal<PurchaseSession>();
  const quantity = (offerId: string) => quantities()[offerId] ?? 1;
  const setQuantity = (offerId: string, value: number) =>
    setQuantities((current) => ({
      ...current,
      [offerId]: Math.max(1, Math.min(20, value)),
    }));
  const purchaseEnabled = () =>
    props.settings?.featureFlags.enableStorePurchases === true;
  const fullStoreEnabled = () =>
    props.settings?.featureFlags.enableFullCs2Store === true;
  const selectedUsesCouponFallback = () =>
    selected()?.coupon === true && !fullStoreEnabled();
  const gcAccepted = () =>
    session()?.diagnostics?.some((line) => line.includes("result=1 (OK:")) ===
    true;
  const steamAuthorizationReceived = () =>
    session()?.diagnostics?.some((line) =>
      line.includes("READY checkout_url="),
    ) === true;
  const offers = () =>
    filterStoreOffers(props.store?.offers ?? [], {
      query: props.query ?? "",
      category: props.categoryFilter ?? "",
      sort: props.sort ?? "name",
    });
  const gameName = () => props.gameName ?? "CS2";
  const appId = () => (gameName() === "TF2" ? 440 : 730);

  const purchase = async () => {
    const offer = selected();
    const snapshot = props.store;
    if (!offer || !snapshot?.priceSheetVersion) return;
    setSession(undefined);
    setBusy(true);
    const amount = offer.saleAmountMinor ?? offer.amountMinor;
    const couponFallback = offer.coupon && !fullStoreEnabled();
    setOutgoingTrace(
      couponFallback
        ? [
            `OPEN Steam BuyItem appid=${appId()} item_def_id=${offer.defIndex} quantity=${quantity(offer.id)}`,
          ]
        : [
            `SEND GC appid=${appId()} emsg=2510 (CMsgGCStorePurchaseInit)`,
            `SEND preview country=<authoritative Steam wallet country> language=0 display_currency=${snapshot.currency ?? offer.currency} item_def_id=${offer.defIndex} quantity=${quantity(offer.id)} cost=${amount * quantity(offer.id)} (the exact country, numeric GC currency, purchase type, supplemental data, and wire bytes will appear below)`,
            `WAIT GC emsg=2511 (CMsgGCStorePurchaseInitResponse); then observe every Steam and ${gameName()} response carrying authorization transaction details`,
          ],
    );
    if (props.settings?.featureFlags.enableProtocolConsole !== false) {
      console.groupCollapsed(`[${gameName()} protocol] store purchase request`);
      for (const line of outgoingTrace()) console.debug(line);
      console.groupEnd();
    }
    setPurchaseDetail(
      couponFallback
        ? "Preparing Steam's supported browser checkout for this coupon item."
        : `Sending the exact live price-sheet item, quantity, currency, total cost, and purchase type to the ${gameName()} Game Coordinator. After the GC accepts it, observing every Steam and ${gameName()} response that can carry the authorization handoff.`,
    );
    const result = await props.onPurchase({
      offerId: offer.id,
      quantity: quantity(offer.id),
      expectedPriceSheetVersion: snapshot.priceSheetVersion,
      expectedAmountMinor: offer.saleAmountMinor ?? offer.amountMinor,
    });
    if (props.settings?.featureFlags.enableProtocolConsole !== false) {
      console.groupCollapsed(
        `[${gameName()} protocol] store purchase result: ${result.status}`,
      );
      console.debug("decoded result", result);
      for (const line of result.diagnostics ?? []) console.debug(line);
      console.groupEnd();
    }
    setSession(result);
    setBusy(false);
    setPurchaseDetail("");
  };

  return (
    <div class="flex-1">
      <div class="flex w-full flex-col gap-5">
        <StoreHeader
          store={props.store}
          purchaseEnabled={purchaseEnabled()}
          browseOnly={props.browseOnly}
          gameName={props.gameName}
        />
        <StoreOfferGrid
          offers={offers()}
          quantity={quantity}
          onOpenContents={setContentsOffer}
          onSetQuantity={setQuantity}
          onBuy={setSelected}
          browseOnly={props.browseOnly}
        />
        <Show when={props.store?.status === "ready" && !offers().length}>
          <Alert>No offers match the current search and filters.</Alert>
        </Show>
      </div>

      <StorePurchaseDialog
        open={!!selected()}
        selected={selected()}
        quantity={quantity}
        busy={busy()}
        purchaseEnabled={purchaseEnabled()}
        purchaseDetail={purchaseDetail()}
        session={session()}
        outgoingTrace={outgoingTrace()}
        purchase={() => void purchase()}
        selectedUsesCouponFallback={selectedUsesCouponFallback()}
        gcAccepted={gcAccepted()}
        steamAuthorizationReceived={steamAuthorizationReceived()}
        gameName={gameName()}
        onClose={() => {
          setSelected(undefined);
          setSession(undefined);
        }}
        onSetQuantity={setQuantity}
        onCopyTrace={() =>
          void globalThis.navigator.clipboard.writeText(
            (session()?.diagnostics ?? outgoingTrace()).join("\n"),
          )
        }
      />

      <StoreContentsDialog
        offer={contentsOffer()}
        onClose={() => setContentsOffer(undefined)}
      />
    </div>
  );
}
