import { createSignal } from "solid-js";
import type { Accessor, Setter } from "solid-js";
import type { InventoryItemDto, SteamAccountProfile } from "@cs-inv-edit/contracts";
import type { AppScreen } from "../../view.js";

export type ShellKindFilter = "all" | InventoryItemDto["kind"];

export interface ShellController {
  view: Accessor<AppScreen>;
  setView: Setter<AppScreen>;
  selectedItemId: Accessor<string | undefined>;
  setSelectedItemId: Setter<string | undefined>;
  query: Accessor<string>;
  setQuery: Setter<string>;
  kindFilter: Accessor<ShellKindFilter>;
  setKindFilter: Setter<ShellKindFilter>;
  compactMode: Accessor<"icons" | "concise" | "detailed">;
  setCompactMode: Setter<"icons" | "concise" | "detailed">;
  accounts: Accessor<SteamAccountProfile[]>;
  setAccounts: Setter<SteamAccountProfile[]>;
  accountUsername: Accessor<string>;
  setAccountUsername: Setter<string>;
}

export function createShellController(initialView: AppScreen = "inventory"): ShellController {
  const [view, setView] = createSignal<AppScreen>(initialView);
  const [selectedItemId, setSelectedItemId] = createSignal<string | undefined>();
  const [query, setQuery] = createSignal("");
  const [kindFilter, setKindFilter] = createSignal<ShellKindFilter>("all");
  const [compactMode, setCompactMode] = createSignal<"icons" | "concise" | "detailed">("concise");
  const [accounts, setAccounts] = createSignal<SteamAccountProfile[]>([]);
  const [accountUsername, setAccountUsername] = createSignal("");

  return {
    view,
    setView,
    selectedItemId,
    setSelectedItemId,
    query,
    setQuery,
    kindFilter,
    setKindFilter,
    compactMode,
    setCompactMode,
    accounts,
    setAccounts,
    accountUsername,
    setAccountUsername,
  };
}
