import { createEffect, createSignal, onCleanup } from "solid-js";
import type { ConnectionStatus } from "@cs-inv-edit/contracts";
import { appErrorMessage, fromAppPromise } from "../lib/result.js";
import QRCode from "qrcode";
import { ResultAsync } from "neverthrow";
import { AccountViewLayout } from "./account-view-sections.js";

export interface AccountViewProps {
  connection: ConnectionStatus | undefined;
  initialUsername?: string;
  onConnect: (input: { username?: string; password?: string }) => Promise<void>;
  onStartSteamQR: () => Promise<void>;
  onSubmitSteamGuard: (input: { code: string }) => Promise<void>;
  onDisconnect: () => Promise<void>;
  onToast?: (toast: { title: string; description?: string; variant?: "default" | "success" | "warning" | "danger" }) => void;
}

export function AccountView(props: AccountViewProps) {
  const [username, setUsername] = createSignal(props.initialUsername ?? "");
  const [password, setPassword] = createSignal("");
  const [passwordVisible, setPasswordVisible] = createSignal(false);
  const [guardCode, setGuardCode] = createSignal("");
  const [status, setStatus] = createSignal("");
  const [loading, setLoading] = createSignal(false);
  const [qrImage, setQRImage] = createSignal("");
  const [qrStartRequested, setQRStartRequested] = createSignal(false);
  const [qrRequestPending, setQRRequestPending] = createSignal(false);
  const [qrRequestSlow, setQRRequestSlow] = createSignal(false);

  createEffect(() => {
    setUsername(props.initialUsername ?? "");
  });

  createEffect(() => {
    const challenge = props.connection?.qrChallengeUrl;
    if (!challenge) { setQRImage(""); return; }
    void ResultAsync.fromPromise(QRCode.toDataURL(challenge, { width: 260, margin: 2 }), (cause) => ({ message: "Failed to render Steam QR code", cause }))
      .match(setQRImage, (error) => setStatus(error.message));
  });

  createEffect(() => {
    const state = props.connection?.state;
    if (state === "connected" || state === "needs_steam_guard" || state === "awaiting_qr" || qrStartRequested()) return;
    setQRStartRequested(true);
    setQRRequestPending(true);
    void fromAppPromise(props.onStartSteamQR(), "Failed to start Steam QR sign-in").match(
      () => setQRRequestPending(false),
      (error) => {
        setQRRequestPending(false);
        setStatus(appErrorMessage(error, "Failed to start Steam QR sign-in."));
      },
    );
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
    if (qrRequestSlow()) return "Still waiting for Steam to create a sign-in session…";
    if (qrRequestPending()) return "Connecting to Steam and requesting a sign-in session…";
    if (props.connection?.state === "error") return props.connection.detail ?? "Steam could not create a QR sign-in session.";
    return "Preparing QR sign-in…";
  };

  const handleConnect = async (e: Event) => {
    e.preventDefault();
    setLoading(true);
    setStatus("Signing in to Steam...");
    await fromAppPromise(props.onConnect({ username: username(), password: password() }), "Failed to sign in").match(() => {
      setStatus("");
    }, (error) => {
      const message = appErrorMessage(error, "Failed to sign in.");
      setStatus(message);
      props.onToast?.({ title: "Sign in failed", description: message, variant: "danger" });
    });
    setLoading(false);
  };

  const handleSteamGuard = async (e: Event) => {
    e.preventDefault();
    if (!guardCode().trim()) {
      setStatus("Enter a Steam Guard code, or approve the sign-in prompt on your phone.");
      return;
    }
    setLoading(true);
    setStatus("Verifying Steam Guard code...");
    await fromAppPromise(props.onSubmitSteamGuard({ code: guardCode() }), "Failed to verify Steam Guard").match(() => {
      setStatus("");
    }, (error) => {
      const message = appErrorMessage(error, "Failed to verify Steam Guard.");
      setStatus(message);
      props.onToast?.({ title: "Steam Guard failed", description: message, variant: "danger" });
    });
    setLoading(false);
  };

  const handleDisconnect = async () => {
    setLoading(true);
    setStatus("Signing out...");
    await fromAppPromise(props.onDisconnect(), "Failed to sign out").match(() => {
      setStatus("Signed out.");
    }, () => {
      setStatus("Failed to sign out.");
      props.onToast?.({ title: "Disconnect failed", description: "The session could not be closed.", variant: "danger" });
    });
    setLoading(false);
  };

  return (
    <AccountViewLayout
      status={status()}
      loading={loading()}
      connectionState={props.connection?.state}
      accountName={props.connection?.accountName}
      username={username()}
      password={password()}
      passwordVisible={passwordVisible()}
      guardCode={guardCode()}
      qrImage={qrImage()}
      qrLoadingText={qrLoadingText()}
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
