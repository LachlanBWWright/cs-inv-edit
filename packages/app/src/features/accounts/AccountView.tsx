import { createEffect, createSignal, onCleanup } from "solid-js";
import type { ConnectionStatus } from "@cs-inv-edit/contracts";
import { appErrorMessage, fromAppPromise } from "../../shared/lib/result.js";
import QRCode from "qrcode";
import { ResultAsync } from "neverthrow";
import { AccountViewLayout } from "./account-view-sections.js";
import type { UIActionOutcome } from "../../shared/lib/ui-action-outcome.js";

export interface AccountViewProps {
  connection: ConnectionStatus | undefined;
  initialUsername?: string;
  loginOnly?: boolean;
  onConnect: (input: {
    username?: string;
    password?: string;
  }) => Promise<UIActionOutcome>;
  onStartSteamQR: () => Promise<UIActionOutcome>;
  onSubmitSteamGuard: (input: { code: string }) => Promise<UIActionOutcome>;
  onDisconnect: () => Promise<UIActionOutcome>;
}

export function AccountView(props: AccountViewProps) {
  const connectionState = () =>
    props.loginOnly && props.connection?.state === "connected"
      ? undefined
      : props.connection?.state;
  const [username, setUsername] = createSignal(props.initialUsername ?? "");
  const [password, setPassword] = createSignal("");
  const [passwordVisible, setPasswordVisible] = createSignal(false);
  const [guardCode, setGuardCode] = createSignal("");
  const [status, setStatus] = createSignal("");
  const [loading, setLoading] = createSignal(false);
  const [qrImage, setQRImage] = createSignal("");
  const [qrRequestPending, setQRRequestPending] = createSignal(false);
  const [qrRequestSlow, setQRRequestSlow] = createSignal(false);

  const startQR = () => {
    if (qrRequestPending()) return;
    setStatus("");
    setQRImage("");
    setQRRequestPending(true);
    void fromAppPromise(
      props.onStartSteamQR(),
      "Failed to start Steam QR sign-in",
    ).match(
      (outcome) => {
        setQRRequestPending(false);
        if (!outcome.ok) setStatus(outcome.message);
      },
      (error) => {
        setQRRequestPending(false);
        setStatus(appErrorMessage(error, "Failed to start Steam QR sign-in."));
      },
    );
  };

  createEffect(() => {
    setUsername(props.initialUsername ?? "");
  });

  createEffect(() => {
    const challenge = props.connection?.qrChallengeUrl;
    if (!challenge) {
      setQRImage("");
      return;
    }
    let active = true;
    void ResultAsync.fromPromise(
      QRCode.toDataURL(challenge, { width: 512, margin: 2 }),
      (cause) => ({ message: "Failed to render Steam QR code", cause }),
    ).match(
      (image) => {
        if (active) setQRImage(image);
      },
      (error) => {
        if (active) setStatus(error.message);
      },
    );
    onCleanup(() => {
      active = false;
    });
  });

  createEffect(() => {
    const state = connectionState();
    if (
      state === "connected" ||
      state === "session_conflict" ||
      state === "needs_steam_guard" ||
      state === "awaiting_qr" ||
      state === "connecting"
    )
      return;
    if (state === "error") {
      const retryTimer = window.setTimeout(startQR, 1_500);
      onCleanup(() => window.clearTimeout(retryTimer));
      return;
    }
    startQR();
  });

  createEffect(() => {
    if (!qrRequestPending()) {
      setQRRequestSlow(false);
      return;
    }
    const slowTimer = window.setTimeout(() => setQRRequestSlow(true), 5_000);
    onCleanup(() => window.clearTimeout(slowTimer));
  });

  const qrLoadingText = () => {
    if (props.connection?.qrChallengeUrl) return "Rendering secure QR code…";
    if (props.connection?.state === "connecting")
      return props.connection.detail ?? "Finishing Steam sign-in…";
    if (qrRequestSlow())
      return "Still waiting for Steam to create a sign-in session…";
    if (qrRequestPending())
      return "Connecting to Steam and requesting a sign-in session…";
    if (props.connection?.state === "error")
      return (
        props.connection.detail ??
        "Steam could not create a QR sign-in session."
      );
    return "Preparing QR sign-in…";
  };

  const handleConnect = async (e: Event) => {
    e.preventDefault();
    setLoading(true);
    setStatus("Signing in to Steam...");
    await fromAppPromise(
      props.onConnect({ username: username(), password: password() }),
      "Failed to sign in",
    ).match(
      (outcome) => setStatus(outcome.ok ? "" : outcome.message),
      (error) => {
        const message = appErrorMessage(error, "Failed to sign in.");
        setStatus(message);
      },
    );
    setLoading(false);
  };

  const handleSteamGuard = async (e: Event) => {
    e.preventDefault();
    if (!guardCode().trim()) {
      setStatus(
        "Enter a Steam Guard code, or approve the sign-in prompt on your phone.",
      );
      return;
    }
    setLoading(true);
    setStatus("Verifying Steam Guard code...");
    await fromAppPromise(
      props.onSubmitSteamGuard({ code: guardCode() }),
      "Failed to verify Steam Guard",
    ).match(
      (outcome) => setStatus(outcome.ok ? "" : outcome.message),
      (error) => {
        const message = appErrorMessage(error, "Failed to verify Steam Guard.");
        setStatus(message);
      },
    );
    setLoading(false);
  };

  const handleDisconnect = async () => {
    setLoading(true);
    setStatus("Signing out...");
    await fromAppPromise(props.onDisconnect(), "Failed to sign out").match(
      (outcome) => setStatus(outcome.ok ? "Signed out." : outcome.message),
      (error) => setStatus(appErrorMessage(error, "Failed to sign out.")),
    );
    setLoading(false);
  };

  return (
    <AccountViewLayout
      status={status()}
      loading={loading()}
      connectionState={connectionState()}
      connectionDetail={props.connection?.detail}
      accountName={props.connection?.accountName}
      username={username()}
      password={password()}
      passwordVisible={passwordVisible()}
      guardCode={guardCode()}
      qrImage={qrImage()}
      qrLoadingText={qrLoadingText()}
      loginOnly={props.loginOnly}
      onUsernameChange={setUsername}
      onPasswordChange={setPassword}
      onPasswordToggle={() => setPasswordVisible((visible) => !visible)}
      onGuardCodeChange={setGuardCode}
      onConnect={handleConnect}
      onSteamGuard={handleSteamGuard}
      onDisconnect={() => void handleDisconnect()}
    />
  );
}
