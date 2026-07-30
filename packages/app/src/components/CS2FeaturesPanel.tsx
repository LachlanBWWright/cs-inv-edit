import { For, Show, createMemo, createSignal } from "solid-js";
import { fromThrowable } from "neverthrow";
import type { CS2FeatureSnapshot, FeatureFlags, InventorySnapshot, OperationReceipt } from "@cs-inv-edit/contracts";

const arrayCount = (value: unknown) => Array.isArray(value) ? value.length : 0;
const matchDetailIdentity = (match: Record<string, unknown>) => {
  const rounds = Array.isArray(match.roundstatsall) ? match.roundstatsall : [];
  const round = rounds[0] as Record<string, unknown> | undefined;
  const confirm = round?.confirm as Record<string, unknown> | undefined;
  const outcomeId = round?.reservationid;
  const token = confirm?.token;
  return outcomeId && token
    ? { matchId: String(match.matchid), outcomeId: String(outcomeId), token: Number(token) }
    : undefined;
};
const readDismissed = fromThrowable(
  (steamId: string): string[] => JSON.parse(globalThis.localStorage.getItem(`cs2.activity.dismissed.${steamId}`) ?? "[]"),
  () => [] as string[],
);
const writeDismissed = fromThrowable(
  (input: { steamId: string; ids: string[] }) => globalThis.localStorage.setItem(`cs2.activity.dismissed.${input.steamId}`, JSON.stringify(input.ids)),
  () => undefined,
);

export function CS2FeaturesPanel(props: {
  features?: CS2FeatureSnapshot;
  inventory?: InventorySnapshot;
  selectedItemId?: string;
  steamId?: string;
  featureFlags?: FeatureFlags;
  onOperation: (type: string, input: unknown) => Promise<OperationReceipt>;
}) {
  const [status, setStatus] = createSignal("");
  const [dismissed, setDismissed] = createSignal<string[]>(props.steamId ? readDismissed(props.steamId).unwrapOr([]) : []);
  const selected = createMemo(() => props.inventory?.items.find((item) => item.id === props.selectedItemId));
  const slots = createMemo(() => {
    const item = selected();
    return item?.defindex ? (props.features?.equipSlots ?? []).filter((slot) => slot.definitionId === item.defindex) : [];
  });
  const submit = async (type: string, input: unknown) => {
    const receipt = await props.onOperation(type, input);
    setStatus(receipt.message || receipt.state);
  };
  const activity = createMemo(() => (props.features?.activity ?? []).filter((entry) => !dismissed().includes(`${entry.kind}:${entry.id ?? ""}`)));
  const activityName = (entry: CS2FeatureSnapshot["activity"][number]) => {
    const definitionId = Number(entry.data.defindex ?? 0);
    const owned = props.inventory?.items.find((item) => item.id === entry.id || item.defindex === definitionId);
    return owned?.name ?? String(entry.data.customname ?? entry.data.defindex ?? entry.id ?? "Inventory event");
  };
  const dismiss = (key: string) => {
    const next = [...new Set([...dismissed(), key])];
    setDismissed(next);
    if (props.steamId) writeDismissed({ steamId: props.steamId, ids: next }).unwrapOr(undefined);
  };
  return <details class="mb-4 rounded-xl border border-slate-800 bg-slate-950">
    <summary class="cursor-pointer px-4 py-3 text-sm font-medium text-slate-200">Loadouts, matches, progression and activity</summary>
    <div class="grid gap-4 border-t border-slate-800 p-4 lg:grid-cols-2">
      <section><h3 class="text-sm font-semibold text-slate-200">Loadout</h3>
        <Show when={selected()} fallback={<p class="mt-2 text-xs text-slate-500">Select an owned item to see compatible slots.</p>}>{(item) => <>
          <p class="mt-1 text-xs text-slate-500">{item().name}</p>
          <div class="mt-3 grid grid-cols-2 gap-2"><For each={slots()}>{(slot) =>
            <button disabled={props.featureFlags?.enableCs2Loadouts !== true} class="rounded-lg border border-slate-800 p-3 text-left text-xs text-slate-300 disabled:opacity-50" onClick={() => void submit("cs2.loadout.set", { game: "cs2", itemId: item().id, classId: slot.classId, slotId: slot.slotId })}>
              <span class="block font-medium">{slot.classId === 2 ? "Terrorists" : slot.classId === 3 ? "Counter-Terrorists" : `Team ${slot.classId}`}</span><span class="text-slate-500">Slot {slot.slotId}</span>
            </button>}</For></div>
          <Show when={!slots().length}><p class="mt-2 text-xs text-slate-500">No published slot matches this item definition.</p></Show>
          <Show when={props.featureFlags?.enableCs2Loadouts !== true}><p class="mt-2 text-xs text-slate-500">Changes are disabled by the default-off CS2 loadout flag.</p></Show>
        </>}</Show>
      </section>
      <section><div class="flex justify-between gap-2"><h3 class="text-sm font-semibold text-slate-200">Recent matches</h3><button class="text-xs text-slate-400" onClick={() => void submit("cs2.matches.recent", { game: "cs2" })}>Refresh</button></div>
        <div class="mt-3 space-y-2"><For each={props.features?.matches ?? []}>{(match) =>
          <div class="rounded-lg border border-slate-800 p-3"><p class="text-sm text-slate-200">Match {String(match.matchid ?? "recorded")}</p><p class="mt-1 text-xs text-slate-500">{match.matchtime ? new Date(Number(match.matchtime) * 1000).toLocaleString() : "Time unavailable"} · {Array.isArray(match.roundstatsall) ? match.roundstatsall.length : 0} stat blocks</p><Show when={matchDetailIdentity(match)} fallback={<p class="mt-2 text-xs text-slate-600">Full-detail token unavailable.</p>}>{(identity) => <button class="mt-2 text-xs text-slate-400" onClick={() => void submit("cs2.matches.details", { game: "cs2", ...identity() })}>Load details</button>}</Show></div>
        }</For><Show when={!props.features?.matches.length}><p class="text-xs text-slate-500">No retained matches returned.</p></Show></div>
      </section>
      <section><h3 class="text-sm font-semibold text-slate-200">Performance</h3><p class="mt-1 text-xs text-slate-500">Level {String(props.features?.profile?.player_level ?? "Unavailable")} · XP {String(props.features?.profile?.player_cur_xp ?? "Unavailable")} · {arrayCount(props.features?.profile?.rankings)} ranking records</p><div class="mt-3 grid grid-cols-3 gap-2 text-xs">
        <div class="border border-slate-800 p-3"><p class="text-slate-500">Premier</p><p class="text-slate-200">{props.features?.premier ? `Season ${String(props.features.premier.season_id ?? "—")} · ${arrayCount(props.features.premier.data_per_map)} maps` : "Unavailable"}</p></div>
        <div class="border border-slate-800 p-3"><p class="text-slate-500">Deep stats</p><p class="text-slate-200">{props.features?.deepStats ? `${arrayCount(props.features.deepStats.matches)} matches retained` : "Unavailable"}</p></div>
        <div class="border border-slate-800 p-3"><p class="text-slate-500">Population</p><p class="text-slate-200">{props.features?.searchStats ? `${String(props.features.searchStats.num_locked_in ?? "—")} queued · ${String(props.features.searchStats.num_found_nearby ?? "—")} nearby` : "Unavailable"}</p></div>
      </div></section>
      <section><div class="flex justify-between gap-2"><h3 class="text-sm font-semibold text-slate-200">Missions and XP Shop</h3><button class="text-xs text-slate-400" onClick={() => void submit("cs2.progression.refresh", { game: "cs2" })}>Refresh</button></div><div class="mt-3 space-y-1 text-xs text-slate-400">
        <For each={props.features?.quests ?? []}>{(quest) => <p>Quest {String(quest.questid)} · {String(quest.points_remaining ?? "—")} remaining · {String(quest.bonus_points ?? 0)} bonus</p>}</For>
        <For each={props.features?.recurringMissions ?? []}>{(mission) => <p>Mission {String(mission.mission_id)} · progress {String(mission.progress ?? "Unavailable")}</p>}</For>
        <For each={props.features?.seasonalOperations ?? []}>{(season) => <p>Season {String(season.season_value)} · tier {String(season.tier_unlocked ?? "—")} · balance {String(season.redeemable_balance ?? "—")}</p>}</For>
        <Show when={props.features?.xpShop}><p>XP Shop state available</p></Show>
      </div></section>
      <section><h3 class="text-sm font-semibold text-slate-200">Rentals</h3><div class="mt-3 space-y-2"><For each={props.features?.rentals ?? []}>{(rental) => <div class="border border-slate-800 p-3 text-xs"><p class="text-slate-200">Container {String(rental.crate_def_index ?? "Unknown")}</p><p class="text-slate-500">Expires {rental.expiration_date ? new Date(Number(rental.expiration_date) * 1000).toLocaleDateString() : "Unavailable"}</p></div>}</For><Show when={!props.features?.rentals.length}><p class="text-xs text-slate-500">No rental history.</p></Show></div></section>
      <section><h3 class="text-sm font-semibold text-slate-200">New items and activity</h3><div class="mt-3 space-y-2"><For each={activity()}>{(entry) => <div class="border border-slate-800 p-3"><div class="flex justify-between gap-2"><p class="text-xs uppercase text-slate-500">{entry.kind.replaceAll("_", " ")}</p><button class="text-xs text-slate-600" onClick={() => dismiss(`${entry.kind}:${entry.id ?? ""}`)}>Dismiss</button></div><p class="text-sm text-slate-200">{activityName(entry)}</p></div>}</For><Show when={!activity().length}><p class="text-xs text-slate-500">No unread activity.</p></Show></div></section>
      <Show when={selected()?.inspectUrl}><section class="lg:col-span-2"><div class="flex justify-between"><h3 class="text-sm font-semibold text-slate-200">Inspect details</h3><button class="text-xs text-slate-400" onClick={() => void submit("cs2.inspect.resolve", { game: "cs2", inspectUrl: selected()?.inspectUrl })}>Resolve selected item</button></div><Show when={props.features?.inspectedItem}>{(item) => <p class="mt-3 text-xs text-slate-400">Paint {String(item().paintindex ?? "—")} · seed {String(item().paintseed ?? "—")} · wear bits {String(item().paintwear ?? "—")} · StatTrak {String(item().killeatervalue ?? "None")} · stickers {arrayCount(item().stickers)} · keychains {arrayCount(item().keychains)} · style {String(item().style ?? "Default")} · upgrade {String(item().upgrade_level ?? "None")}</p>}</Show></section></Show>
      <Show when={status()}><p class="text-xs text-slate-500 lg:col-span-2">{status()}</p></Show>
    </div>
  </details>;
}
