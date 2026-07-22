import { Show } from "solid-js";
import { Alert } from "./ui/Alert.js";
import { Button } from "./ui/Button.js";
import { Input } from "./ui/Input.js";

export interface AccountViewLayoutProps {
  status: string;
  loading: boolean;
  connectionState: string | undefined;
  accountName: string | undefined;
  username: string;
  password: string;
  passwordVisible: boolean;
  guardCode: string;
  qrImage: string;
  qrLoadingText: string;
  onUsernameChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onPasswordToggle: () => void;
  onGuardCodeChange: (value: string) => void;
  onConnect: (event: Event) => void;
  onSteamGuard: (event: Event) => void;
  onDisconnect: () => void;
}

function renderConnectionPanel(props: AccountViewLayoutProps) {
  if (props.connectionState === "connected") {
    return <ConnectedStateCard accountName={props.accountName} loading={props.loading} onDisconnect={props.onDisconnect} />;
  }

  if (props.connectionState === "needs_steam_guard") {
    return <SteamGuardForm guardCode={props.guardCode} loading={props.loading} onSubmit={props.onSteamGuard} onCancel={props.onDisconnect} onGuardCodeChange={props.onGuardCodeChange} />;
  }

  return (
    <div class="grid flex-1 gap-8 md:grid-cols-[minmax(0,1fr)_1px_minmax(20rem,1.15fr)] md:items-stretch lg:gap-10">
      <CredentialsForm username={props.username} password={props.password} passwordVisible={props.passwordVisible} loading={props.loading} onUsernameChange={props.onUsernameChange} onPasswordChange={props.onPasswordChange} onPasswordToggle={props.onPasswordToggle} onConnect={props.onConnect} />
      <div class="hidden w-px bg-slate-800 md:block" aria-hidden="true" />
      <QrSignInPanel qrImage={props.qrImage} qrLoadingText={props.qrLoadingText} />
    </div>
  );
}

export function AccountViewLayout(props: AccountViewLayoutProps) {
  const descriptionText = props.connectionState === "needs_steam_guard"
    ? "Approve the sign-in on your phone, or enter a Steam Guard code below."
    : "Sign in to your Steam account to load inventory and keep name-tag, tool, and storage actions scoped to the active account.";
  return (
    <div class="h-full overflow-y-auto">
      <div class="mx-auto flex min-h-full w-full max-w-6xl flex-col px-1 py-2 sm:px-2 lg:py-4">
        <header class="mb-6 flex flex-col gap-2 border-b border-slate-800 pb-5">
          <h2 class="text-2xl font-semibold text-slate-50">Steam inventory access</h2>
          <p class="max-w-3xl text-sm text-slate-400">{descriptionText}</p>
        </header>
        <Show when={props.status}>
          <Alert class="mb-5" variant="warning">{props.status}</Alert>
        </Show>
        {renderConnectionPanel(props)}
      </div>
    </div>
  );
}

interface ConnectedStateCardProps {
  accountName: string | undefined;
  loading: boolean;
  onDisconnect: () => void;
}

function ConnectedStateCard(props: ConnectedStateCardProps) {
  return (
    <div class="space-y-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4">
      <div>
        <h3 class="font-semibold text-emerald-100">Signed in</h3>
        <p class="mt-1 text-sm text-emerald-200">{props.accountName ? `Signed in as ${props.accountName}.` : "Your Steam session is active."} Live inventory and mutations stay scoped to this account.</p>
      </div>
      <Button variant="secondary" class="w-full justify-center" onClick={() => props.onDisconnect()} disabled={props.loading}>Disconnect account</Button>
    </div>
  );
}

interface SteamGuardFormProps {
  guardCode: string;
  loading: boolean;
  onSubmit: (event: Event) => void;
  onCancel: () => void;
  onGuardCodeChange: (value: string) => void;
}

function SteamGuardForm(props: SteamGuardFormProps) {
  return (
    <form class="space-y-4" onSubmit={props.onSubmit}>
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
        <Input type="text" value={props.guardCode} onInput={(e) => props.onGuardCodeChange((e.currentTarget as HTMLInputElement | null)?.value ?? "")} disabled={props.loading} placeholder="Enter code from email or mobile app" autocomplete="one-time-code" />
      </div>
      <Button type="submit" class="w-full justify-center" disabled={props.loading}>{props.loading ? "Verifying..." : "Submit code"}</Button>
      <Button type="button" variant="ghost" class="w-full justify-center" onClick={() => props.onCancel()} disabled={props.loading}>Cancel</Button>
    </form>
  );
}

interface CredentialsFormProps {
  username: string;
  password: string;
  passwordVisible: boolean;
  loading: boolean;
  onUsernameChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onPasswordToggle: () => void;
  onConnect: (event: Event) => void;
}

function PasswordToggle(props: { passwordVisible: boolean; onPasswordToggle: () => void }) {
  return (
    <button type="button" class="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-lg text-slate-400 transition hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan-400" aria-label={props.passwordVisible ? "Hide password" : "Show password"} aria-pressed={props.passwordVisible} onClick={() => props.onPasswordToggle()}>
      <Show when={props.passwordVisible} fallback={
        <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M2.1 12s3.6-6 9.9-6 9.9 6 9.9 6-3.6 6-9.9 6-9.9-6-9.9-6Z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      }>
        <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="m3 3 18 18" />
          <path d="M10.6 6.2A10.8 10.8 0 0 1 12 6c6.3 0 9.9 6 9.9 6a17.7 17.7 0 0 1-2.2 2.9" />
          <path d="M6.6 6.6C3.7 8.4 2.1 12 2.1 12s3.6 6 9.9 6a9.7 9.7 0 0 0 4.1-.9" />
          <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
        </svg>
      </Show>
    </button>
  );
}

function CredentialsForm(props: CredentialsFormProps) {
  return (
    <form class="w-full space-y-5 md:self-center" onSubmit={props.onConnect}>
      <h3 class="font-semibold text-slate-100">Sign in with your account</h3>
      <div class="space-y-2">
        <label class="text-sm font-medium text-slate-200">Steam username</label>
        <Input type="text" value={props.username} onInput={(e) => props.onUsernameChange((e.currentTarget as HTMLInputElement | null)?.value ?? "")} disabled={props.loading} autocomplete="username" required />
      </div>
      <div class="space-y-2">
        <label class="text-sm font-medium text-slate-200">Password</label>
        <div class="relative">
          <Input type={props.passwordVisible ? "text" : "password"} value={props.password} class="pr-12" onInput={(e) => props.onPasswordChange((e.currentTarget as HTMLInputElement | null)?.value ?? "")} disabled={props.loading} autocomplete="current-password" required />
          <PasswordToggle passwordVisible={props.passwordVisible} onPasswordToggle={props.onPasswordToggle} />
        </div>
      </div>
      <Button type="submit" class="w-full justify-center" disabled={props.loading}>{props.loading ? "Signing in..." : "Sign in"}</Button>
    </form>
  );
}

interface QrSignInPanelProps {
  qrImage: string;
  qrLoadingText: string;
}

function QrSignInPanel(props: QrSignInPanelProps) {
  return (
    <section class="flex min-h-80 flex-col items-center justify-center border-t border-slate-800 pt-8 text-center md:border-0 md:pt-0" aria-labelledby="qr-sign-in-heading">
      <h3 id="qr-sign-in-heading" class="font-semibold text-slate-100">Sign in with a QR code</h3>
      <p class="mt-2 max-w-sm text-sm text-slate-400">Open the Steam mobile app, choose the QR scanner, and scan this code.</p>
      <Show when={props.qrImage} fallback={<div class="mt-5 flex aspect-square w-full max-w-md items-center justify-center rounded-2xl border border-slate-700 bg-slate-950/60 px-6 text-sm text-slate-400" role="status" aria-live="polite">{props.qrLoadingText}</div>}>
        <img class="mt-5 aspect-square w-full max-w-md rounded-2xl bg-white p-3" src={props.qrImage} alt="Steam sign-in QR code" />
      </Show>
    </section>
  );
}
