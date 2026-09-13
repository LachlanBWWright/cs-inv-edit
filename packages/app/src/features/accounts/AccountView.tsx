import { createEffect, createSignal, onCleanup } from "solid-js";
import type { ConnectionStatus } from "@cs-inv-edit/contracts";
import { appErrorMessage, fromAppPromise } from "../../shared/lib/result.js";
import QRCode from "qrcode";
import { ResultAsync } from "neverthrow";
import { AccountViewLayout } from "./account-view-sections.js";
import type { UIActionOutcome } from "../../shared/lib/ui-action-outcome.js";

export interface AccountViewProps {
  connection: ConnectionStatus | undefined;
  connectionLoading: boolean;
  initialUsername?: string;
  loginOnly?: boolean;
  onConnect: (input: {
    username?: string;
    password?: string;
  }) => Promise<UIActionOutcome>;
  onStartSteamQR: () => Promise<UIActionOutcome>;
  onRetrySteamQR?: () => void;
  onRefreshSteamQR?: () => void;
  onSubmitSteamGuard: (input: { code: string }) => Promise<UIActionOutcome>;
  onDisconnect: () => Promise<UIActionOutcome>;
}

export function shouldStartSteamQR(
  connection: ConnectionStatus | undefined,
  connectionLoading: boolean,
  loginOnly = false,
): boolean {
  if (connectionLoading) return false;
  if (connection?.state === "connected") return loginOnly;
  return ![
    "session_conflict",
    "needs_steam_guard",
    "awaiting_qr",
    "connecting",
  ].includes(connection?.state ?? "");
}

export function steamQrLoadingText(
  connection: ConnectionStatus | undefined,
  requestPending: boolean,
  requestSlow: boolean,
): string {
  if (connection?.qrChallengeUrl) return "Rendering secure QR code…";
  if (connection?.state === "connecting")
    return connection.detail ?? "Finishing Steam sign-in…";
  if (connection?.state === "awaiting_qr")
    return connection.detail ?? "Waiting for Steam to create a sign-in session…";
  if (connection?.state === "error")
    return connection.detail ?? "Steam could not create a QR sign-in session.";
  if (requestSlow) return "Still waiting for Steam to create a sign-in session…";
  if (requestPending)
    return "Connecting to Steam and requesting a sign-in session…";
  return "Preparing QR sign-in…";
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
  let qrRequestGeneration = 0;
  let qrAutoStartConsumed = false;

  const startQR = (force = false) => {
    if (qrRequestPending() && !force) return;
    const generation = ++qrRequestGeneration;
    setStatus("");
    setQRImage("");
    setQRRequestPending(true);
    void fromAppPromise(
      props.onStartSteamQR(),
      "Failed to start Steam QR sign-in",
    ).match(
      (outcome) => {
        if (generation !== qrRequestGeneration) return;
        setQRRequestPending(false);
        if (!outcome.ok) setStatus(outcome.message);
      },
      (error) => {
        if (generation !== qrRequestGeneration) return;
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
    if (qrAutoStartConsumed) return;
    // Wait for the authoritative initial status before requesting a QR
    // session. Otherwise the first render can race status restoration and
    // leave the UI waiting for a challenge that the watcher never observes.
    if (
      !shouldStartSteamQR(
        props.connection,
        props.connectionLoading,
        props.loginOnly,
      )
    )
      return;

    // Use the actual connection state here. `connectionState()` intentionally
    // hides connected state in login-only mode for presentation purposes, but
    // that must not trigger a new QR login.
    const state = props.connection?.state;
    if (state === "error") {
      return;
    }
    qrAutoStartConsumed = true;
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

  const qrLoadingText = () =>
    steamQrLoadingText(
      props.connection,
      qrRequestPending(),
      qrRequestSlow(),
    );

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
      onRetrySteamQR={startQR}
      onRefreshSteamQR={() => startQR(true)}
    />
  );
}
