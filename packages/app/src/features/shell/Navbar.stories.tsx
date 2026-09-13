import type { Meta, StoryObj } from "storybook-solidjs-vite";
import type { SettingsData, SteamAccountProfile } from "@cs-inv-edit/contracts";
import { Navbar } from "./Navbar.js";
import type { NavbarProps } from "./navbar-props.js";

const noop = () => undefined;
const account: SteamAccountProfile = {
  accountName: "anchll",
  steamId: "76561198000000000",
  signedIn: true,
  lastSignedInAt: "2026-09-12T00:00:00Z",
};
const settings: SettingsData = {
  backendUrl: "http://127.0.0.1:7331",
  validationMode: true,
  sacrificialAccountMode: true,
  armoryPurchasePacingSeconds: 5,
  storageRetrievalPacingSeconds: 1,
  animations: {
    container: "slot-machine",
    tradeUp: "slot-machine",
    armory: "slot-machine",
    terminal: "slot-machine",
  },
  featureFlags: {
    enableStorageMutations: true,
    enableContainerOpening: true,
    enableInventoryDebug: false,
    showStorageUnitItems: false,
    enableTradeups: true,
    enableNameTags: true,
    enableItemDeletion: true,
    enableStatTrakSwap: true,
    enableStrangeParts: true,
    enableItemUse: true,
    enableToolApplication: true,
    enableGifting: true,
    enableArmoryRead: true,
    enableArmoryRedemption: true,
    enableStoreRead: true,
    enableStorePurchases: true,
    enableFullCs2Store: true,
    enableCs2Loadouts: true,
    enableTf2Inventory: true,
    enableTf2Store: true,
    enableTf2Loadouts: true,
    enableTf2ItemUse: true,
    enableTf2Tools: true,
    enableTf2Crafting: true,
    enableTf2Tradeups: true,
    enableTf2Unboxing: true,
    enableTf2Customization: true,
    enableDota2Inventory: true,
    enableSteamInventory: true,
    enableSteamTradeMutations: true,
    enablePriceAnalysis: true,
  },
};

const baseArgs: NavbarProps = {
  view: "inventory",
  setView: noop,
  platform: "desktop",
  health: { status: "ok", service: "storybook", version: "test", time: "" },
  connection: {
    state: "connected",
    accountName: account.accountName,
    steamId: account.steamId,
  },
  accounts: [account],
  inventory: undefined,
  settings,
  query: "",
  setQuery: noop,
  kindFilter: "all",
  setKindFilter: noop,
  rarityFilter: "all",
  setRarityFilter: noop,
  weaponFilter: "all",
  setWeaponFilter: noop,
  collectionFilter: "all",
  setCollectionFilter: noop,
  sort: "name",
  setSort: noop,
  rarityOptions: ["Consumer Grade", "Restricted", "Classified"],
  weaponOptions: ["AK-47", "M4A1-S"],
  collectionOptions: ["The Dust 2 Collection"],
  compactMode: "concise",
  setCompactMode: noop,
  economyTagFilter: "",
  setEconomyTagFilter: noop,
  economyCategoryOptions: [
    ["keychain", "keychain"],
    ["sticker", "sticker"],
    ["weapon_skin", "weapon_skin"],
  ],
  economySort: "name",
  setEconomySort: noop,
  steamServiceGames: {
    games: [
      {
        appId: 730,
        name: "Counter-Strike 2",
        playtimeMinutes: 12_000,
        lastPlayed: 1_757_635_200,
        hasMarket: true,
      },
    ],
    refreshedAt: "2026-09-12T00:00:00Z",
    status: "ready",
    diagnostics: [],
  },
  steamServiceGamesLoading: false,
  steamServiceAppId: 730,
  setSteamServiceAppId: noop,
  onAddAccount: noop,
  onSignInAccount: noop,
  onSignOutAccount: noop,
  onDeleteAccount: noop,
  onRefreshInventory: noop,
  onRefreshCurrentInventory: noop,
  commerceCategoryFilter: "",
  setCommerceCategoryFilter: noop,
  commerceCategoryOptions: ["Cases", "Keys", "Passes"],
  commerceSort: "name",
  setCommerceSort: noop,
  onOpenAccount: noop,
  onSaveSettings: async () => ({ ok: true }),
  tf2MatchGroup: 7,
  setTF2MatchGroup: noop,
  tf2ActivityFilter: "all",
  setTF2ActivityFilter: noop,
  tf2ActivityLoading: undefined,
  onTF2HistoryRefresh: noop,
  onTF2ContextRefresh: noop,
  onTF2CampaignRefresh: noop,
  cs2ActivityFilter: "all",
  setCS2ActivityFilter: noop,
  cs2ActivityLoading: false,
  onCS2ActivityRefresh: noop,
};

const meta = {
  title: "Shell/Navbar",
  component: Navbar,
  args: baseArgs,
  decorators: [
    (Story) => (
      <div class="min-h-24 bg-slate-950">
        <Story />
      </div>
    ),
  ],
  parameters: {
    docs: {
      description: {
        component:
          "Navbar coverage for every application view and its conditional control combinations.",
      },
    },
  },
} satisfies Meta<typeof Navbar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Inventory: Story = { args: { view: "inventory" } };
export const CS2Activity: Story = { args: { view: "cs2-features" } };
export const CS2Loadouts: Story = { args: { view: "cs2-loadouts" } };
export const Trades: Story = { args: { view: "trades" } };
export const Armory: Story = { args: { view: "armory" } };
export const Store: Story = { args: { view: "store" } };
export const SteamInventory: Story = { args: { view: "steam-inventory" } };
export const SteamServiceInventory: Story = {
  args: { view: "steam-service-inventory" },
};
export const TF2Inventory: Story = { args: { view: "tf2-inventory" } };
export const TF2Loadouts: Story = { args: { view: "tf2-loadouts" } };
export const TF2Matches: Story = { args: { view: "tf2-matches" } };
export const TF2Campaigns: Story = { args: { view: "tf2-campaigns" } };
export const TF2Store: Story = { args: { view: "tf2-store" } };
export const Dota2Inventory: Story = { args: { view: "dota2-inventory" } };
export const PriceAnalysis: Story = { args: { view: "price-analysis" } };
export const Account: Story = { args: { view: "account" } };
