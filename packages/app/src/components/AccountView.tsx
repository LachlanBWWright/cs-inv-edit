import { createEffect, createSignal, Show } from "solid-js";
import type { ConnectionStatus } from "@cs-inv-edit/contracts";
import { Alert } from "./ui/Alert.js";
import { Button } from "./ui/Button.js";
import { Card, CardContent, CardHeader } from "./ui/Card.js";
import { Input } from "./ui/Input.js";
import { appErrorMessage, fromAppPromise } from "../lib/result.js";
import QRCode from "qrcode";
import { ResultAsync } from "neverthrow";

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
    void props.onStartSteamQR();
  });

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
    <div class="mx-auto max-w-4xl">
      <Card class="overflow-hidden">
        <CardHeader>
          <div class="flex flex-col gap-2">
            <h2 class="text-2xl font-semibold text-slate-50">Steam inventory access</h2>
            <p class="text-sm text-slate-400">
              {props.connection?.state === "needs_steam_guard"
                ? "Approve the sign-in on your phone, or enter a Steam Guard code below."
                : "Sign in to your Steam account to load inventory and keep name-tag, tool, and storage actions scoped to the active account."}
            </p>
          </div>
        </CardHeader>
        <CardContent class="space-y-5">
          <Show when={status()}>
            <Alert variant="warning">{status()}</Alert>
          </Show>

          <Show when={props.connection?.state === "connected"}>
            <div class="space-y-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4">
              <div>
                <h3 class="font-semibold text-emerald-100">Signed in</h3>
                <p class="mt-1 text-sm text-emerald-200">
                  {props.connection?.accountName ? `Signed in as ${props.connection.accountName}.` : "Your Steam session is active."} Live inventory and mutations stay scoped to this account.
                </p>
              </div>
              <Button variant="secondary" class="w-full justify-center" onClick={() => void handleDisconnect()} disabled={loading()}>
                Disconnect account
              </Button>
            </div>
          </Show>

          <Show when={props.connection?.state === "needs_steam_guard"}>
            <form class="space-y-4" onSubmit={handleSteamGuard}>
              <div class="flex items-center gap-3 rounded-2xl border border-sky-400/20 bg-sky-400/10 px-4 py-3" role="status" aria-live="polite">
                <span class="relative flex h-3 w-3 shrink-0" aria-hidden="true">
                  <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-300 opacity-75" />
                  <span class="relative inline-flex h-3 w-3 rounded-full bg-sky-400" />
                </span>
                <div>
                  <p class="text-sm font-medium text-sky-100">Checking for approval on your phone</p>
                  <p class="mt-0.5 text-xs text-sky-200/80">This page will continue automatically when you approve the Steam sign-in.</p>
                </div>
              </div>
              <div class="space-y-2">
                <label class="text-sm font-medium text-slate-200">Steam Guard code</label>
                <Input
                  type="text"
                  value={guardCode()}
                  onInput={(e) => setGuardCode((e.currentTarget as HTMLInputElement | null)?.value ?? "")}
                  disabled={loading()}
                  placeholder="Enter code from email or mobile app"
                  autocomplete="one-time-code"
                />
              </div>
              <Button type="submit" class="w-full justify-center" disabled={loading()}>
                {loading() ? "Verifying..." : "Submit code"}
              </Button>
              <Button type="button" variant="ghost" class="w-full justify-center" onClick={() => void handleDisconnect()} disabled={loading()}>
                Cancel
              </Button>
            </form>
          </Show>

          <Show when={props.connection?.state !== "connected" && props.connection?.state !== "needs_steam_guard"}>
            <div class="grid gap-6 md:grid-cols-[minmax(0,1fr)_1px_18rem] md:items-stretch">
              <form class="space-y-4" onSubmit={handleConnect}>
                <h3 class="font-semibold text-slate-100">Sign in with your account</h3>
                <div class="space-y-2">
                  <label class="text-sm font-medium text-slate-200">Steam username</label>
                  <Input type="text" value={username()} onInput={(e) => setUsername((e.currentTarget as HTMLInputElement | null)?.value ?? "")} disabled={loading()} autocomplete="username" required />
                </div>
                <div class="space-y-2">
                  <label class="text-sm font-medium text-slate-200">Password</label>
                  <div class="relative">
                    <Input
                      type={passwordVisible() ? "text" : "password"}
                      value={password()}
                      class="pr-12"
                      onInput={(e) => setPassword((e.currentTarget as HTMLInputElement | null)?.value ?? "")}
                      disabled={loading()}
                      autocomplete="current-password"
                      required
                    />
                    <button
                      type="button"
                      class="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-lg text-slate-400 transition hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan-400"
                      aria-label={passwordVisible() ? "Hide password" : "Show password"}
                      aria-pressed={passwordVisible()}
                      onClick={() => setPasswordVisible((visible) => !visible)}
                    >
                      <Show
                        when={passwordVisible()}
                        fallback={
                          <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                            <path d="M2.1 12s3.6-6 9.9-6 9.9 6 9.9 6-3.6 6-9.9 6-9.9-6-9.9-6Z" />
                            <circle cx="12" cy="12" r="3" />
                          </svg>
                        }
                      >
                        <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                          <path d="m3 3 18 18" />
                          <path d="M10.6 6.2A10.8 10.8 0 0 1 12 6c6.3 0 9.9 6 9.9 6a17.7 17.7 0 0 1-2.2 2.9" />
                          <path d="M6.6 6.6C3.7 8.4 2.1 12 2.1 12s3.6 6 9.9 6a9.7 9.7 0 0 0 4.1-.9" />
                          <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
                        </svg>
                      </Show>
                    </button>
                  </div>
                </div>
                <Button type="submit" class="w-full justify-center" disabled={loading()}>
                  {loading() ? "Signing in..." : "Sign in"}
                </Button>
              </form>

              <div class="hidden w-px bg-slate-800 md:block" aria-hidden="true" />

              <section class="flex min-h-72 flex-col items-center border-t border-slate-800 pt-6 text-center md:border-0 md:pt-0" aria-labelledby="qr-sign-in-heading">
                <h3 id="qr-sign-in-heading" class="font-semibold text-slate-100">Sign in with a QR code</h3>
                <p class="mt-2 max-w-64 text-sm text-slate-400">Open the Steam mobile app, choose the QR scanner, and scan this code.</p>
                <Show
                  when={qrImage()}
                  fallback={
                    <div class="mt-5 flex h-48 w-48 items-center justify-center rounded-xl border border-slate-700 bg-slate-950/60 text-sm text-slate-500" role="status">
                      Generating QR code…
                    </div>
                  }
                >
                  <img class="mt-5 h-48 w-48 rounded-xl bg-white p-2" src={qrImage()} alt="Steam sign-in QR code" />
                </Show>
              </section>
            </div>
          </Show>
        </CardContent>
      </Card>
    </div>
  );
}
