import type {
  ConnectionStatus,
  HealthStatus,
  InventoryItemDto,
  InventorySnapshot,
  SettingsData,
  SteamAccountProfile,
  SteamInventoryServiceGames,
} from "@cs-inv-edit/contracts";
import type { UIActionOutcome } from "../../shared/lib/ui-action-outcome.js";
import type { InventorySort } from "../inventory/inventory-view-utils.js";
import type { CommerceSort } from "../commerce/commerce-view-utils.js";
import type { EconomyInventorySort } from "../inventory/game-inventory-utils.js";
import type { TF2ActivityFilter } from "../tf2/tf2-activity-utils.js";
import type { CS2ActivityFilter } from "../cs2/CS2FeaturesPanel.js";
import type { AppScreen } from "./view.js";

export interface SidebarProps {
  view: AppScreen;
  setView: (view: AppScreen) => void;
  platform: "desktop" | "web";
  health: HealthStatus | undefined;
  connection: ConnectionStatus | undefined;
  accounts: SteamAccountProfile[];
  inventory: InventorySnapshot | undefined;
  settings: SettingsData | undefined;
  query: string;
  setQuery: (value: string) => void;
  kindFilter: "all" | InventoryItemDto["kind"];
  setKindFilter: (value: "all" | InventoryItemDto["kind"]) => void;
  rarityFilter: string;
  setRarityFilter: (value: string) => void;
  weaponFilter: string;
  setWeaponFilter: (value: string) => void;
  collectionFilter: string;
  setCollectionFilter: (value: string) => void;
  sort: InventorySort;
  setSort: (value: InventorySort) => void;
  rarityOptions: string[];
  weaponOptions: string[];
  collectionOptions: string[];
  compactMode: "icons" | "concise" | "detailed";
  setCompactMode: (value: "icons" | "concise" | "detailed") => void;
  economyTagFilter: string;
  setEconomyTagFilter: (value: string) => void;
  economyCategoryOptions: [string, string][];
  economySort: EconomyInventorySort;
  setEconomySort: (value: EconomyInventorySort) => void;
  steamServiceGames: SteamInventoryServiceGames | undefined;
  steamServiceGamesLoading: boolean;
  steamServiceAppId: number | undefined;
  setSteamServiceAppId: (appId: number | undefined) => void;
  onAddAccount: () => void;
  onSignInAccount: (account: SteamAccountProfile) => void;
  onSignOutAccount: (account: SteamAccountProfile) => void;
  onDeleteAccount: (account: SteamAccountProfile) => void;
  onRefreshInventory: () => void;
  onRefreshCurrentInventory: () => void;
  commerceCategoryFilter: string;
  setCommerceCategoryFilter: (value: string) => void;
  commerceCategoryOptions: string[];
  commerceSort: CommerceSort;
  setCommerceSort: (value: CommerceSort) => void;
  onOpenAccount?: () => void;
  onSaveSettings: (next: SettingsData) => Promise<UIActionOutcome>;
  tf2MatchGroup: number;
  setTF2MatchGroup: (value: number) => void;
  tf2ActivityFilter: TF2ActivityFilter;
  setTF2ActivityFilter: (value: TF2ActivityFilter) => void;
  tf2ActivityLoading?: "history" | "context";
  onTF2HistoryRefresh: () => void;
  onTF2ContextRefresh: () => void;
  onTF2CampaignRefresh: () => void;
  cs2ActivityFilter: CS2ActivityFilter;
  setCS2ActivityFilter: (value: CS2ActivityFilter) => void;
  cs2ActivityLoading: boolean;
  onCS2ActivityRefresh: () => void;
}
