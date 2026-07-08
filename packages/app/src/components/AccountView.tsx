import { createSignal, Show } from "solid-js";
import type { ConnectionStatus } from "@cs-inv-edit/contracts";

export interface AccountViewProps {
  connection: ConnectionStatus | undefined;
  onConnect: (input: { username?: string; password?: string }) => Promise<void>;
  onSubmitSteamGuard: (input: { code: string }) => Promise<void>;
  onDisconnect: () => Promise<void>;
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
    try {
      await props.onConnect({ username: username(), password: password() });
      setStatus("");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to sign in.");
    } finally {
      setLoading(false);
    }
  };

  const handleSteamGuard = async (e: Event) => {
    e.preventDefault();
    setLoading(true);
    setStatus("Verifying Steam Guard code...");
    try {
      await props.onSubmitSteamGuard({ code: guardCode() });
      setStatus("");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to verify Steam Guard.");
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    setLoading(true);
    setStatus("Signing out...");
    try {
      await props.onDisconnect();
      setStatus("Signed out.");
    } catch {
      setStatus("Failed to sign out.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div class="mx-auto max-w-md space-y-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <header>
        <h2 class="text-2xl font-semibold">Steam Sign In</h2>
        <p class="mt-1 text-sm text-slate-600">
          Sign in to your Steam account to fetch your inventory and interact with the Game Coordinator.
        </p>
      </header>

      <Show when={status()}>
        <div class="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
          {status()}
        </div>
      </Show>

      <Show when={props.connection?.state === "connected"}>
        <div class="space-y-4">
          <div class="rounded-lg border border-green-200 bg-green-50 p-4">
            <h3 class="font-semibold text-green-900">Signed In</h3>
            <p class="mt-1 text-sm text-green-800">
              Your Steam session is active. Live GC inventory mutations are linked to this account.
            </p>
          </div>
          <button
            type="button"
            onClick={handleDisconnect}
            disabled={loading()}
            class="w-full rounded-md border border-slate-300 bg-white px-4 py-2 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Sign Out / Switch Account
          </button>
        </div>
      </Show>

      <Show when={props.connection?.state === "awaiting_guard"}>
        <form class="space-y-4" onSubmit={handleSteamGuard}>
          <div class="space-y-1">
            <label class="text-sm font-medium text-slate-700">Steam Guard Code</label>
            <input
              type="text"
              class="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400"
              value={guardCode()}
              onInput={(e) => setGuardCode(e.currentTarget.value)}
              disabled={loading()}
              placeholder="Enter code from email or mobile app"
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading()}
            class="w-full rounded-md bg-cyan-700 px-4 py-2 text-white hover:bg-cyan-800 disabled:opacity-50"
          >
            {loading() ? "Verifying..." : "Submit Code"}
          </button>
          <button
            type="button"
            onClick={handleDisconnect}
            disabled={loading()}
            class="w-full rounded-md border border-transparent bg-transparent px-4 py-2 text-sm text-slate-500 hover:text-slate-700 disabled:opacity-50"
          >
            Cancel
          </button>
        </form>
      </Show>

      <Show when={props.connection?.state !== "connected" && props.connection?.state !== "awaiting_guard"}>
        <form class="space-y-4" onSubmit={handleConnect}>
          <div class="space-y-1">
            <label class="text-sm font-medium text-slate-700">Steam Username</label>
            <input
              type="text"
              class="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400"
              value={username()}
              onInput={(e) => setUsername(e.currentTarget.value)}
              disabled={loading()}
              required
            />
          </div>
          <div class="space-y-1">
            <label class="text-sm font-medium text-slate-700">Password</label>
            <input
              type="password"
              class="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400"
              value={password()}
              onInput={(e) => setPassword(e.currentTarget.value)}
              disabled={loading()}
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading()}
            class="w-full rounded-md bg-cyan-700 px-4 py-2 text-white hover:bg-cyan-800 disabled:opacity-50"
          >
            {loading() ? "Signing in..." : "Sign In"}
          </button>
        </form>
      </Show>
    </div>
  );
}
