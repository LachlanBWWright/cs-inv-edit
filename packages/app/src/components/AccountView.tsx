import { createSignal, Show } from "solid-js";
import type { ConnectionStatus } from "@cs-inv-edit/contracts";
import { Alert } from "./ui/Alert.js";
import { Button } from "./ui/Button.js";
import { Card, CardContent, CardHeader } from "./ui/Card.js";
import { Input } from "./ui/Input.js";
import { appErrorMessage, fromAppPromise } from "../lib/result.js";

export interface AccountViewProps {
  connection: ConnectionStatus | undefined;
  onConnect: (input: { username?: string; password?: string }) => Promise<void>;
  onSubmitSteamGuard: (input: { code: string }) => Promise<void>;
  onDisconnect: () => Promise<void>;
  onToast?: (toast: { title: string; description?: string; variant?: "default" | "success" | "warning" | "danger" }) => void;
}

export function AccountView(props: AccountViewProps) {
  const [username, setUsername] = createSignal("");
  const [password, setPassword] = createSignal("");
  const [guardCode, setGuardCode] = createSignal("");
  const [status, setStatus] = createSignal("");
  const [loading, setLoading] = createSignal(false);

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
    <div class="mx-auto max-w-2xl">
      <Card class="overflow-hidden">
        <CardHeader>
          <div class="flex flex-col gap-2">
            <h2 class="text-2xl font-semibold text-slate-50">Steam inventory access</h2>
            <p class="text-sm text-slate-400">
              Sign in to your Steam account to load inventory and keep name-tag, tool, and storage actions scoped to the active account.
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
              <Alert>Approve the Steam sign-in prompt on your phone. This page will continue automatically, or you can enter a Steam Guard code below.</Alert>
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
            <form class="space-y-4" onSubmit={handleConnect}>
              <div class="space-y-2">
                <label class="text-sm font-medium text-slate-200">Steam username</label>
                <Input type="text" value={username()} onInput={(e) => setUsername((e.currentTarget as HTMLInputElement | null)?.value ?? "")} disabled={loading()} autocomplete="username" required />
              </div>
              <div class="space-y-2">
                <label class="text-sm font-medium text-slate-200">Password</label>
                <Input type="password" value={password()} onInput={(e) => setPassword((e.currentTarget as HTMLInputElement | null)?.value ?? "")} disabled={loading()} autocomplete="current-password" required />
              </div>
              <Button type="submit" class="w-full justify-center" disabled={loading()}>
                {loading() ? "Signing in..." : "Sign in"}
              </Button>
            </form>
          </Show>
        </CardContent>
      </Card>
    </div>
  );
}
