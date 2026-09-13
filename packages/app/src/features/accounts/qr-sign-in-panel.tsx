import { Show } from "solid-js";
import { Button } from "../../shared/ui/Button.js";

export interface QrSignInPanelProps {
  qrImage: string;
  qrLoadingText: string;
  connectionState: string | undefined;
  onRetrySteamQR?: () => void;
  onRefreshSteamQR?: () => void;
}

function QrResetButton(props: QrSignInPanelProps) {
  const canReset = () =>
    (props.connectionState === "error" && props.onRetrySteamQR) ||
    ((props.connectionState === "awaiting_qr" ||
      props.connectionState === "connecting") &&
      props.onRefreshSteamQR);

  return (
    <Show when={canReset()}>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        class="mt-1"
        onClick={() =>
          props.connectionState === "error"
            ? props.onRetrySteamQR?.()
            : props.onRefreshSteamQR?.()
        }
      >
        {props.connectionState === "error"
          ? "Try QR sign-in again"
          : "↻ Refresh QR"}
      </Button>
    </Show>
  );
}

export function QrSignInPanel(props: QrSignInPanelProps) {
  return (
    <section
      class="flex flex-col items-center text-center"
      aria-labelledby="qr-sign-in-heading"
    >
      <h3 id="qr-sign-in-heading" class="font-semibold text-slate-100">
        Sign in with a QR code
      </h3>
      <Show
        when={props.qrImage}
        fallback={
          <div
            class="mt-3 flex aspect-square w-full max-w-80 flex-col items-center justify-center gap-4 rounded-2xl bg-slate-950 px-6 text-sm text-slate-400"
            role="status"
            aria-live="polite"
          >
            <p class="max-w-64 text-center leading-6">{props.qrLoadingText}</p>
            <QrResetButton {...props} />
          </div>
        }
      >
        <img
          class="mt-3 aspect-square w-full max-w-80 rounded-2xl bg-white p-3"
          src={props.qrImage}
          alt="Steam sign-in QR code"
        />
        <QrResetButton {...props} />
      </Show>
    </section>
  );
}
