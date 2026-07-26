import { For, Show, createSignal } from "solid-js";
import type {
  InitializeStorePurchaseRequest,
  PurchaseSession,
  SettingsData,
  StoreSnapshot,
} from "@cs-inv-edit/contracts";
import { Alert } from "./ui/Alert.js";
import { Button } from "./ui/Button.js";
import { Card } from "./ui/Card.js";
import { Dialog } from "./ui/Dialog.js";
import { LoadingProgress } from "./ui/LoadingProgress.js";

type StoreOffer = StoreSnapshot["offers"][number];

export function StoreView(props: {
  store?: StoreSnapshot;
  settings?: SettingsData;
  onRefresh: () => Promise<unknown>;
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
  const gcAccepted = () =>
    session()?.diagnostics?.some((line) => line.includes("result=1 (OK:")) ===
    true;
  const steamAuthorizationReceived = () =>
    session()?.diagnostics?.some((line) =>
      line.includes("READY checkout_url="),
    ) === true;

  const purchase = async () => {
    const offer = selected();
    const snapshot = props.store;
    if (!offer || !snapshot?.priceSheetVersion) return;
    setSession(undefined);
    setBusy(true);
    const amount = offer.saleAmountMinor ?? offer.amountMinor;
    setOutgoingTrace([
      `SEND GC appid=730 emsg=2510 (CMsgGCStorePurchaseInit)`,
      `SEND preview country=<authoritative Steam wallet country> language=0 display_currency=${snapshot.currency ?? offer.currency} item_def_id=${offer.defIndex} quantity=${quantity(offer.id)} cost=${amount * quantity(offer.id)} (the exact country, numeric GC currency, purchase type, supplemental data, and wire bytes will appear below)`,
      `WAIT GC emsg=2511 (CMsgGCStorePurchaseInitResponse); then observe every Steam and CS2 response carrying authorization transaction details`,
    ]);
    if (props.settings?.featureFlags.enableProtocolConsole !== false) {
      console.groupCollapsed("[CS2 protocol] store purchase request");
      for (const line of outgoingTrace()) console.debug(line);
      console.groupEnd();
    }
    setPurchaseDetail(
      "Sending the exact live price-sheet item, quantity, currency, total cost, and purchase type to the CS2 Game Coordinator. After the GC accepts it, observing every Steam and CS2 response that can carry the authorization handoff—not assuming one desktop-session message.",
    );
    const result = await props.onPurchase({
      offerId: offer.id,
      quantity: quantity(offer.id),
      expectedPriceSheetVersion: snapshot.priceSheetVersion,
      expectedAmountMinor: offer.saleAmountMinor ?? offer.amountMinor,
    });
    if (props.settings?.featureFlags.enableProtocolConsole !== false) {
      console.groupCollapsed(
        `[CS2 protocol] store purchase result: ${result.status}`,
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
    <div class="min-h-0 flex-1 overflow-y-auto">
      <div class="mx-auto flex max-w-6xl flex-col gap-5">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p class="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-300">
              CS2 Store
            </p>
            <h1 class="mt-1 text-3xl font-semibold">Cash store</h1>
            <p class="mt-2 text-sm text-slate-400">
              Offers and account-local prices come from the CS2 Game
              Coordinator. Payment is completed on Steam.
            </p>
          </div>
          <Button onClick={() => void props.onRefresh()}>Refresh Store</Button>
        </div>

        <Show when={!props.store || props.store.status === "loading"}>
          <LoadingProgress
            active
            title="Loading CS2 Store"
            stages={[
              {
                afterSeconds: 0,
                label: "Requesting the GC price sheet",
                detail: "Loading current offers and account-local currency.",
              },
              {
                afterSeconds: 10,
                label: "Parsing store data",
                detail: "Matching the price sheet with live CS2 item metadata.",
              },
            ]}
            currentStage={props.store?.message}
          />
        </Show>
        <Show when={props.store?.status === "requires_connection"}>
          <Alert variant="warning">
            {props.store?.message ||
              "Connect Steam to load the CS2 cash store."}
          </Alert>
        </Show>
        <Show when={props.store?.status === "error"}>
          <Alert variant="danger">{props.store?.message}</Alert>
        </Show>
        <Show when={props.store?.status === "ready" && !purchaseEnabled()}>
          <Alert variant="warning">
            Browsing is enabled, but purchases are locked. Enable{" "}
            <code>enableStorePurchases</code> in Settings before confirming a
            real-money transaction.
          </Alert>
        </Show>
        <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <For each={props.store?.offers ?? []}>
            {(offer) => (
              <Card class="p-5">
                <button
                  type="button"
                  class="block w-full"
                  onClick={() => setContentsOffer(offer)}
                >
                  <Show when={offer.imageUrl}>
                    <img
                      class="mx-auto h-32 object-contain"
                      src={offer.imageUrl}
                      alt=""
                    />
                  </Show>
                  <h2 class="mt-3 text-left text-lg font-semibold text-cyan-200 hover:underline">
                    {offer.name}
                  </h2>
                </button>
                <p class="mt-1 text-sm text-slate-400">{offer.category}</p>
                <div class="mt-4 flex items-end justify-between gap-3">
                  <div>
                    <Show when={offer.saleAmountMinor !== undefined}>
                      <p class="text-sm text-slate-500 line-through">
                        {offer.formattedPrice}
                      </p>
                    </Show>
                    <p class="text-xl font-semibold text-cyan-300">
                      {offer.formattedSalePrice || offer.formattedPrice}
                    </p>
                  </div>
                  <div class="flex items-center gap-2">
                    <Button
                      variant="secondary"
                      disabled={quantity(offer.id) <= 1}
                      onClick={() =>
                        setQuantity(offer.id, quantity(offer.id) - 1)
                      }
                    >
                      −
                    </Button>
                    <span class="min-w-7 text-center font-mono">
                      {quantity(offer.id)}
                    </span>
                    <Button
                      variant="secondary"
                      disabled={quantity(offer.id) >= 20}
                      onClick={() =>
                        setQuantity(offer.id, quantity(offer.id) + 1)
                      }
                    >
                      +
                    </Button>
                    <Button
                      disabled={!offer.purchasable}
                      onClick={() => setSelected(offer)}
                    >
                      Buy
                    </Button>
                  </div>
                </div>
                <p class="mt-2 text-right text-sm text-slate-400">
                  Total: {offer.currency}{" "}
                  {(
                    ((offer.saleAmountMinor ?? offer.amountMinor) *
                      quantity(offer.id)) /
                    100
                  ).toFixed(2)}
                </p>
                <Show when={!offer.purchasable}>
                  <p class="mt-3 text-xs text-amber-300">
                    {offer.unsupportedReason}
                  </p>
                </Show>
              </Card>
            )}
          </For>
        </div>
        <Show
          when={props.store?.status === "ready" && !props.store?.offers.length}
        >
          <Alert>
            No supported offers were present in the current GC price sheet.
          </Alert>
        </Show>
      </div>

      <Dialog
        open={!!selected()}
        title="Confirm Steam purchase"
        description="Prepare a Steam-hosted page where you can review and authorize the purchase."
        onOpenChange={(open) => {
          if (!open && !busy()) {
            setSelected(undefined);
            setSession(undefined);
          }
        }}
      >
        <p class="text-sm text-slate-200">Item: {selected()?.name}</p>
        <label class="mt-4 block text-sm">
          Quantity{" "}
          <input
            class="ml-2 w-20 rounded border border-slate-700 bg-slate-900 p-2"
            type="number"
            min="1"
            max="20"
            value={selected() ? quantity(selected()!.id) : 1}
            onInput={(event) => {
              const offer = selected();
              if (offer)
                setQuantity(offer.id, Number(event.currentTarget.value));
            }}
          />
        </label>
        <p class="mt-4 font-semibold">
          Total:{" "}
          {selected()
            ? `${selected()?.currency} ${(((selected()?.saleAmountMinor ?? selected()?.amountMinor ?? 0) * quantity(selected()!.id)) / 100).toFixed(2)}`
            : ""}
        </p>
        <p class="mt-2 text-xs text-slate-400">
          Payment is completed securely through Steam. This app never collects
          card details or auto-authorizes the transaction.
        </p>
        <Show when={busy()}>
          <div class="mt-3 rounded-lg border border-cyan-900/60 bg-cyan-950/30 p-3">
            <p class="text-sm font-semibold text-cyan-200">
              Preparing the Steam purchase link…
            </p>
            <p class="mt-1 text-xs leading-5 text-slate-300">
              {purchaseDetail()}
            </p>
            <p class="mt-2 text-xs text-slate-500">
              This app does not submit or authorize payment. The Steam page
              opens only after you click the resulting link.
            </p>
          </div>
        </Show>
        <Show when={session()?.status === "failed"}>
          <Alert variant="danger" class="mt-3">
            <Show when={session()?.errorCode}>
              <p class="mb-1 font-semibold">
                {session()?.errorCode}{" "}
                <Show when={session()?.errorResult !== undefined}>
                  (GC purchase result {session()?.errorResult})
                </Show>
              </p>
            </Show>
            <p>{session()?.message}</p>
          </Alert>
        </Show>
        <Show when={session()?.status === "awaiting_user"}>
          <Alert variant="success" class="mt-3">
            <p>{session()?.message}</p>
            <div class="mt-2 text-xs text-slate-300">
              <p>
                Item: {session()?.name} × {session()?.quantity}
              </p>
              <p>Total: {session()?.formattedAmount}</p>
              <Show when={session()?.transactionId}>
                <p>
                  Steam transaction:{" "}
                  <span class="font-mono">{session()?.transactionId}</span>
                </p>
              </Show>
            </div>
            <Show when={session()?.checkoutUrl}>
              {(checkoutUrl) => (
                <a
                  class="mt-3 inline-flex rounded-lg bg-cyan-400 px-4 py-2 font-semibold text-slate-950 hover:bg-cyan-300"
                  href={checkoutUrl()}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Review and authorize on Steam
                </a>
              )}
            </Show>
            <p class="mt-2 text-xs text-slate-400">
              Nothing opens automatically. This link opens a new tab only when
              you click it.
            </p>
          </Alert>
        </Show>
        <Show when={busy() || (session()?.diagnostics?.length ?? 0) > 0}>
          <section class="mt-3 rounded-lg border border-slate-700 bg-slate-950/80 p-3">
            <h3 class="text-sm font-semibold text-slate-200">
              Purchase activity
            </h3>
            <div class="mt-3 space-y-2 text-sm text-slate-300">
              <p>
                ✓ Sent a request to purchase <strong>{selected()?.name}</strong>{" "}
                × {selected() ? quantity(selected()!.id) : 1} for{" "}
                <strong>
                  {selected()
                    ? `${selected()!.currency} ${(((selected()!.saleAmountMinor ?? selected()!.amountMinor) * quantity(selected()!.id)) / 100).toFixed(2)}`
                    : ""}
                </strong>
                .
              </p>
              <Show when={busy()}>
                <p class="text-cyan-300">
                  … Waiting for the CS2 Game Coordinator.
                </p>
              </Show>
              <Show when={gcAccepted()}>
                <p class="text-emerald-300">
                  ✓ The CS2 Game Coordinator accepted the purchase request and
                  created an order.
                </p>
              </Show>
              <Show
                when={
                  gcAccepted() &&
                  !steamAuthorizationReceived() &&
                  session()?.status === "failed"
                }
              >
                <p class="text-red-300">
                  ✕ Steam did not send the authorization message needed to
                  create the confirmation link.
                </p>
              </Show>
              <Show when={steamAuthorizationReceived()}>
                <p class="text-emerald-300">
                  ✓ Steam returned the authorization transaction.
                </p>
              </Show>
            </div>
            <details class="mt-3 border-t border-slate-800 pt-3">
              <summary class="cursor-pointer text-xs font-medium text-slate-400">
                Raw protocol data (message IDs, enum values and hexadecimal
                bytes)
              </summary>
              <div class="mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-all rounded bg-black/40 p-3 font-mono text-[11px] leading-5 text-slate-300">
                <For each={session()?.diagnostics ?? outgoingTrace()}>
                  {(line) => <div>{line}</div>}
                </For>
              </div>
              <Button
                class="mt-3"
                variant="secondary"
                onClick={() =>
                  void globalThis.navigator.clipboard.writeText(
                    (session()?.diagnostics ?? outgoingTrace()).join("\n"),
                  )
                }
              >
                Copy raw trace
              </Button>
            </details>
          </section>
        </Show>
        <Show when={!purchaseEnabled()}>
          <p class="mt-3 text-sm text-amber-300">
            Unlock confirmation by enabling Store Purchases in Settings.
          </p>
        </Show>
        <div class="mt-5 flex gap-2">
          <Show when={session()?.status !== "awaiting_user"}>
            <Button
              disabled={busy() || !purchaseEnabled()}
              onClick={() => void purchase()}
            >
              {busy() ? "Preparing…" : "Prepare Steam link"}
            </Button>
          </Show>
          <Button
            variant="secondary"
            disabled={busy()}
            onClick={() => {
              setSelected(undefined);
              setSession(undefined);
            }}
          >
            {session()?.status === "awaiting_user" ? "Close" : "Cancel"}
          </Button>
        </div>
      </Dialog>

      <Dialog
        open={!!contentsOffer()}
        title={contentsOffer()?.name || "Store item"}
        description="Item delivered by this store offer"
        onOpenChange={(open) => {
          if (!open) setContentsOffer(undefined);
        }}
      >
        <Show
          when={(contentsOffer()?.items?.length ?? 0) > 0}
          fallback={
            <p class="text-sm text-slate-400">
              No separate produced-item preview is defined for this offer.
            </p>
          }
        >
          <div class="grid gap-3 sm:grid-cols-2">
            <For each={contentsOffer()?.items ?? []}>
              {(item) => (
                <div class="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
                  <Show when={item.imageUrl}>
                    <img
                      class="mx-auto h-28 object-contain"
                      src={item.imageUrl}
                      alt=""
                    />
                  </Show>
                  <p class="mt-2 text-sm font-medium">
                    {item.marketName || item.name}
                  </p>
                </div>
              )}
            </For>
          </div>
        </Show>
      </Dialog>
    </div>
  );
}
