# Protobuf-backed extension opportunities

## Purpose and scope

This document records product extensions suggested by the vendored Steam, CS2,
and TF2 protobuf definitions. It is research, not an implementation plan. No
protobuf definition alone proves that a request is currently accepted, that it
is client-to-GC rather than server/internal traffic, or that all required state
transitions are understood.

The sources inspected were:

- CS2 GameTracking protobufs at commit
  `1574fa8c61d8ba804776ced95daac718304148c9`;
- SteamTracking/Protobufs at commit
  `a8658d7a579eeb9feed0cd20ff0295e3414c3f5b`;
- TF2 GameTracking protobufs at commit
  `b6d0d7c104db22f520f5608e25aec4a7580a5fd2`.

For CS2 and TF2, owned items must continue to come from each game's GC
`CSOEconItem` SOCache. Steam Community or Steam unified-service data can enrich
metadata but must not silently add items to a GC-owned inventory.

## Cross-cutting safety rules

- Start read-only features before related mutations.
- Put each mutation family behind a separate, default-off feature flag.
- Confirm message direction and current-client use with sanitized captures.
- Reconcile every successful mutation against authoritative server state.
- Do not automatically retry a sent destructive or value-bearing request after
  a timeout.
- Keep AppID and protocol namespaces explicit; identical EMsg values across
  games do not imply identical payloads.
- Generate bindings from authoritative source definitions. Do not hand-edit
  generated output or infer a binary layout when a message exists.

## CS2 opportunities

The repository already represents the obvious inventory mutations: container
opening, trade-ups, stickers, name tags, deletion, StatTrak swaps, strange
parts, generic item/tool use, gifting, storage, Armory redemption, and store
transactions. The following areas add materially different functionality.

### 1. Loadout management

Status: implemented for authoritative manual equipment.

The CS2 inventory screen consumes `CSOEconEquipSlot` from full and incremental
SOCache updates. Selecting an owned item exposes only authoritative slots with
the same item definition, and manual changes use the direct vendored
`CMsgAdjustEquipSlots` descriptor. The mutation is protected by the
default-off `enableCs2Loadouts` flag, revalidates GC ownership in the backend,
and completes only after the matching equip-slot SO update. Shuffle remains an
optional later presentation mode rather than being inferred locally.

Build a class/slot loadout editor with manual equipment changes and optional
shuffle support.

Evidence:

- `CSOEconEquipSlot`, `CMsgAdjustEquipSlot`, and `CMsgAdjustEquipSlots` in
  `proto/vendor/gametracking-cs2/Protobufs/base_gcmessages.proto`;
- `k_EMsgGCAdjustEquipSlotsManual` (2531) and
  `k_EMsgGCAdjustEquipSlotsShuffle` (2532) in `econ_gcmessages.proto`.

This is a strong first candidate because the request and shared-object state are
typed, the action is reversible, and it fits naturally into the existing
inventory details UI.

### 2. Match history and item-acquisition provenance

Status: implemented as a read-only inventory surface.

Recent-match requests derive the account ID from the authenticated Steam ID.
Match cards retain complete round-stat blocks and offer full-info requests only
when the GC supplied the required match, reservation/outcome, and token values;
the UI never asks the user to type them. Match-end reward notifications and
item acknowledgements enter the activity feed as exact event types. The app
does not claim a timestamp-only match/drop correlation as exact.

Request recent matches and full match details, then correlate match-end drops
and subsequent inventory changes with matches.

Evidence:

- `CMsgGCCStrike15_v2_MatchListRequestRecentUserGames`;
- `CMsgGCCStrike15_v2_MatchListRequestFullGameInfo`;
- `CMsgGCCStrike15_v2_MatchList` and `CDataGCCStrike15_v2_MatchInfo`;
- `CMsgGCCStrike15_v2_MatchEndRewardDropsNotification`.

The first release should be read-only. Correlation should be labelled as exact
only when the GC supplies a matching item or event identifier; timestamp-only
matches are inferences.

### 3. Premier and performance analytics

Status: implemented as read-only coordinator state.

The transport retains matchmaking hello/profile state, Premier season
summaries, deep-stat ranges and matches, and matchmaking search population.
The inventory surface distinguishes unavailable data from numeric zero and
shows account level/XP, ranking-record counts, season/map coverage, retained
deep-stat match counts, and nearby/queued population.

Add rank history, per-map performance, multi-kill rounds, XP, medals, and
commendation summaries.

Evidence:

- `CMsgGCCStrike15_v2_PremierSeasonSummary`;
- `CMsgGCCStrike15_ClientDeepStats`;
- `CMsgGCCStrike15_v2_MatchmakingGC2ClientHello`;
- `CMsgGCCStrike15_v2_ClientRequestPlayersProfile` and
  `CMsgGCCStrike15_v2_PlayersProfile`.

Availability and retention may differ by account, subscription, or season, so
missing ranges must not be rendered as zero-valued performance.

### 4. Authoritative inspect-link resolution

Status: implemented contextually for owned items.

Steam-supplied inspect actions on the selected owned inventory item are parsed
into S/A/D or M/A/D parameters in the backend. EMsg 9157 responses remain
separate from owned inventory and expose paint, seed, wear bits, StatTrak,
stickers, keychains, variations/style, and upgrade-level data. Malformed links
fail without exposing protocol-ID fields to users, and receipts time out
without retrying.

Resolve Steam inspect parameters into paint, seed, wear, StatTrak, stickers,
keychains, variations, style, and upgrade-level data. This could power listing
validation and side-by-side comparisons without treating inspected items as
owned.

Evidence:

- `CMsgGCCStrike15_v2_Client2GCEconPreviewDataBlockRequest`;
- `CMsgGCCStrike15_v2_Client2GCEconPreviewDataBlockResponse`;
- `CEconItemPreviewDataBlock`.

### 5. Rental tracking

Status: implemented read-only.

`CSOEconRentalHistory` is detected and retained from full, incremental, and
removal SO messages. The inventory surface displays container definition,
issue date, and expiration date while preserving empty/unavailable states.
Rental-expiration acknowledgement remains unimplemented because it is a
mutation and requires its own default-off flag and confirmed reconciliation.

Display active container rentals, issue and expiry dates, and expired-rental
state.

Evidence:

- `CMsgOpenCrate.for_rental`;
- `CSOEconRentalHistory`;
- `CMsgAcknowledgeRentalExpiration`;
- `k_EMsgGCAcknowledgeRentalExpiration` (2535).

Read-only history is the safe starting point. The app should not offer a rental
mutation until a current client capture establishes eligibility, confirmation,
and post-request state.

### 6. Missions, XP shop, and progression

Status: implemented read-only.

Quest progress, recurring missions, seasonal operations, XP-shop state, and
recurring mission schema responses are retained per active coordinator session.
The inventory surface shows remaining/bonus quest points, recurring progress,
season tiers and balances, and XP-shop availability. Refresh uses the typed
recurring-schedule request. Redemption, XP-track acknowledgement, and other
value-bearing operations are not enabled by this read-only implementation.

Add a read-only progression dashboard for recurring missions, seasonal state,
XP-shop tracks, balances, and refresh periods.

Evidence:

- `CSOQuestProgress`, `CSOAccountRecurringMission`, and
  `CSOAccountSeasonalOperation`;
- `CSOAccountXpShop` and `CMsgGCCStrike15_v2_GC2ClientNotifyXPShop`;
- `CMsgRequestRecurringMissionSchedule` and `CMsgRecurringMissionSchema`.

Armory, XP-shop, volatile-shop, and older operation objects must remain
distinct. Similar balance fields do not prove interchangeable redemption
flows.

### 7. New-item inbox and activity history

Status: implemented with account-local dismissal.

Item acknowledgements and match-end reward drops are decoded into bounded
activity entries and correlated to current inventory metadata when possible.
The feed is embedded in the existing inventory screen, and dismissed entries
are stored under an account-specific local key. No GC acknowledgement mutation
is sent; adding one later requires a separate default-off feature flag.

Show newly acquired items separately and build an account-labelled feed for
drops, container awards, gifts, purchases, and trades.

Evidence:

- `k_EMsgGCItemAcknowledged` (1087);
- `CMsgItemAcknowledged`;
- match-end reward notifications and the existing inventory reconciliation
  stream.

Acknowledgement is a mutation and should remain independently gated. The
activity feed itself can be assembled read-only.

### 8. GC-backed inventory organization

Support automatic sort presets, explicit item positions, and reconciliation
between local grouping and GC inventory order.

Evidence:

- `CMsgSortItems`;
- `CMsgSetItemPositions`;
- `k_EMsgGCSortItems` (1041) and `k_EMsgGCSetItemPositions` (1077).

## Steam platform opportunities

The Steam protobuf tree contains platform-wide unified services, not just the
AppID 753 Community inventory. Features should be selected because they support
the inventory/account product rather than attempting to recreate the Steam
client.

### 1. Unified cross-app inventory diagnostics

Use the Steam `Econ` service as an authenticated metadata and diagnostics layer
for assets already in scope. It can return inventory items with descriptions,
asset class information, property schemas, and a trade-offer access token.

Evidence:

- `Econ.GetInventoryItemsWithDescriptions`;
- `Econ.GetAssetClassInfo`;
- `Econ.GetAssetPropertySchema`;
- `Econ.GetTradeOfferAccessToken`;
- `proto/vendor/steam-protobufs/steam/steammessages_econ.steamclient.proto`.

This should complement, not replace, CS2/TF2 GC ownership. A useful first
feature would compare GC items with Steam descriptions and expose missing,
ambiguous, or stale overlays in the protocol diagnostics UI.

### 2. Steam Inventory Service item support

Status: implemented as a read-only, AppID-scoped inventory source.

Add a distinct inventory mode for games that use the Steam Inventory Service.
The protocol supports inventory retrieval, item-definition metadata, item
inspection, stack splitting/combining, exchanges, consumption, purchases, and
new-item notifications.

Evidence:

- `Inventory.GetInventory`, `Inventory.GetItemDefMeta`, and
  `Inventory.InspectItem`;
- `Inventory.SplitItemStack`, `Inventory.CombineItemStacks`, and
  `Inventory.ExchangeItem`;
- `InventoryClient.NotifyNewItems`;
- `proto/vendor/steam-protobufs/steam/steammessages_inventory.steamclient.proto`.

These APIs are AppID-scoped and are not a generic replacement for GC economy
protocols. Mutations require per-game evidence that the game actually uses the
service and permits the operation.

### 3. Steam profile-cosmetic organizer

Extend the AppID 753 Community-item view into a profile-cosmetic dashboard:
owned and equipped profile items, backgrounds, mini-profile backgrounds, avatar
frames, animated avatars, favorite badges, themes, showcases, and emoticons.

Evidence:

- `Player.GetProfileItemsOwned` and `Player.GetProfileItemsEquipped`;
- the `Get`/`Set` methods for profile backgrounds, avatar frames, animated
  avatars, favorite badges, and profile themes;
- `Player.GetProfileCustomization`;
- `proto/vendor/steam-protobufs/steam/steammessages_player.steamclient.proto`.

Read-only owned/equipped comparison is the recommended first stage. Equipping
profile items should be broken into explicit reversible mutations.

### 4. Authentication-session health and account security

Add an account-security panel showing active auth sessions and refresh tokens,
with device/session labelling and explicit revocation.

Evidence:

- `Authentication.EnumerateTokens`;
- `Authentication.GetAuthSessionsForAccount`;
- `Authentication.RevokeToken` and `RevokeRefreshToken`;
- `proto/vendor/steam-protobufs/steam/steammessages_auth.steamclient.proto`.

Token values must never be returned to the renderer or written to diagnostics.
Revocation is security-sensitive and must require exact-session confirmation.

### 5. Cloud backup for local app configuration

Optionally back up non-secret application state such as display preferences,
saved filters, price-watch lists, and local loadout templates using Steam Cloud
file enumeration and upload/download flows.

Evidence:

- `Cloud.EnumerateUserFiles`, `GetFileDetails`, and `GetSingleFileInfo`;
- `Cloud.BeginHTTPUpload`/`CommitHTTPUpload`;
- client file download and conflict-resolution messages;
- `proto/vendor/steam-protobufs/steam/steammessages_cloud.steamclient.proto`.

This should never include credentials, access tokens, full private inventories,
or protocol captures. Conflict handling must be explicit rather than
last-writer-wins.

### 6. Account-wide play and achievement context

Enrich account views with owned games, playtime, achievement progress, game
badges, and last-played times. This provides useful context around multi-game
inventories without adding mutations.

Evidence:

- `Player.GetOwnedGames`, `GetAchievementsProgress`, `GetGameAchievements`,
  `GetUserAchievements`, `GetGameBadgeLevels`, and `ClientGetLastPlayedTimes`.

### 7. Family sharing context

For users who opt in, show which games are family-shared, the preferred lender,
and relevant playtime summaries. This can explain why a game is playable but
does not expose an expected owned inventory.

Evidence:

- `FamilyGroups.GetFamilyGroupForUser`;
- `FamilyGroups.GetSharedLibraryApps`;
- `FamilyGroups.GetPreferredLenders`;
- `FamilyGroups.GetPlaytimeSummary`;
- `proto/vendor/steam-protobufs/steam/steammessages_familygroups.steamclient.proto`.

Family membership mutations are outside the appropriate scope for this app.

## TF2 opportunities

The current repository already has a read-only AppID 440 GC inventory and
feature-gated scaffolding for loadouts, item use, Strange tools, crafting,
unboxing, and customization. Recommendations below distinguish improvements to
those areas from genuinely new surfaces.

### 1. Complete loadouts and class presets

Status: implemented.

The app has a nine-class loadout UI and can send authoritative equip,
preset-item, and active-preset requests. It decodes full and incremental TF2
SOCache updates for preset instances and active class presets from the direct
vendored GameTracking-TF2 descriptor. The UI initializes from active-preset
state and resolves each slot against the selected authoritative preset, with
equipped-item state retained only as a fallback for older or incomplete
caches.

Sent mutations are correlated with the exact class/preset/slot state expected
from subsequent shared-object updates. Receipts complete only after that
authoritative match and fail after a bounded timeout without retrying.

Expand the current single-item equip operation into a complete nine-class
loadout and preset editor, including active preset selection and slot-level
reconciliation.

Evidence:

- `CMsgAdjustItemEquippedState`;
- `CMsgSetPresetItemPosition`;
- `CMsgSelectPresetForClass`;
- `CSOEconItemPresetInstance` and `CSOClassPresetClientData`;
- EMsgs 1059, 1063, and 1064.

This is the highest-confidence TF2 extension because it is reversible and both
request and authoritative state objects are defined.

### 2. Full Strange-item workshop

Status: implemented for protobuf-verified operations.

The standard inventory selected-item panel exposes apply-part, restriction,
count-transfer, individual-counter removal, and whole-score reset workflows.
Users select compatible owned items rather than entering IDs. The UI is absent
unless `enableTf2Tools` is enabled, and the backend independently enforces that
default-off flag, authoritative ownership, Strange quality, tool
classification, transfer compatibility, and explicit permanent-action
confirmation.

Item-eater recharge, killstreak removal, and Strange count adjustment remain
capture-gated because the tracked source supplies EMsgs without verified
request bodies. They must not be implemented by guessing a binary layout.

Extend applying Strange parts/restrictions/transfers with removal, score reset,
recharging, killstreak removal, and clearer per-counter history.

Evidence:

- `CMsgApplyStrangePart`, `CMsgApplyStrangeRestriction`, and
  `CMsgApplyStrangeCountTransfer`;
- `CMsgGCRemoveStrangePart` and `CMsgGCResetStrangeScores`;
- EMsgs for item-eater recharge, killstreak removal, and Strange count
  adjustment in `econ_gcmessages.proto`.

Every sub-operation should have its own compatibility rules and confirmation.
Removal and reset operations are permanent even if the underlying item remains.

### 3. Competitive and match-history dashboard

Status: implemented as a read-only dashboard.

The app sends match-history and matchmaking-context requests; retains match,
ladder, rating, daily-rollup, population, and datacenter-ping responses; and
shows score, kills, deaths, damage, healing, support, party, season, map,
rating, and rating-change values. Missing protobuf fields are rendered as
unavailable rather than zero.

Show per-match score, kills, deaths, damage, healing, support, medals, rating
changes, map, party, and season data. Add population and datacenter information
as optional matchmaking context.

Evidence:

- `CSOTFMatchResultPlayerStats`;
- `CMsgGCMatchHistoryLoad`;
- `CSOTFLadderPlayerStats` and `CSOTFRatingData`;
- `CMsgGC_DailyCompetitiveStatsRollup_Response`;
- `CMsgGCMatchMakerStatsResponse` and `CMsgGCDataCenterPing_Update`.

This can be entirely read-only and is a stronger near-term addition than
capture-gated crafting or unboxing.

### 4. TF2 inspect resolver

Status: implemented for owned-item inspect actions.

Owned items with Steam-supplied TF2 inspect actions expose a contextual
“Resolve inspect details” action. The backend parses S/A/D or M/A/D parameters,
sends the typed request, correlates the response by request time, and converts
EMsg 6403 into a typed recursive item model containing attributes, equipped
states, style, original ID, and nested items. Pending, malformed, unavailable,
stale, and timeout outcomes remain separate from GC-owned inventory.

Resolve TF2 inspect parameters to the complete `CSOEconItem`, including nested
items, attributes, equipped state, style, and original ID.

Evidence:

- `CMsgGC_Client2GCEconPreviewDataBlockRequest`;
- `CMsgGC_Client2GCEconPreviewDataBlockResponse`;
- `CEconItemPreviewDataBlock`.

Inspected assets must remain visually and structurally separate from owned GC
inventory.

### 5. Contract and quest progress

Status: implemented as a read-only contracts surface.

The transport retains quest, quest-map-node, reward-purchase, and progress
objects per account session. The activity surface renders active/inactive
quests, three objective point tracks, earned stars, reward-claim state, map
cycles, and reward-purchase counts. Item pickup events resolve names only
through the authoritative GC-owned inventory.

Turn-in, discard, unlock, loaner-item, and reward-purchase mutations remain
capture-gated and outside the initial read-only release.

Build a contracts dashboard showing active quests, earned stars, completion,
earned items, reward credits, and quest-map state.

Evidence:

- `CMsgQuestProgressReport`;
- `CMsgGCQuestIdentify`;
- quest-node unlock, turn-in, reward-purchase, discard, and loaner-item
  messages;
- quest objective progress messages in `econ_gcmessages.proto`.

Start with shared-object and notification reads. Turn-in, discard, unlock, and
reward purchase are value-bearing mutations and require live capture.

### 6. TF2 new-item and notification inbox

Status: implemented with account-local inbox state.

Notifications, XP sources, quest progress, and item acknowledgements are
decoded into bounded activity entries and rendered with friendly descriptions.
Local dismissals persist under an account-specific key, and item events resolve
against current GC-owned inventory metadata. No GC acknowledgement mutation is
sent by the inbox; adding one later requires its own default-off flag and
verified reconciliation.

Present item pickups, GC notifications, XP sources, and acknowledgement state
in one account-labelled activity surface.

Evidence:

- `CMsgGCNotification` and `CMsgGCNotificationQueue`;
- `CMsgNotificationAcknowledge`;
- `CMsgAcknowledgeXP`, `CMsgTFXPSource`, and
  `CMsgTFXPSourceBreakdown`;
- `CMsgItemAcknowledged`.

Reads and local dismissal can ship before GC acknowledgement mutations.

### 7. GC market snapshot

Status: implemented.

The inventory requests `CMsgGCClientMarketDataRequest` without exposing a
numeric protocol-ID field, retains EMsg 1081 entries, matches them to current
TF2 inventory metadata by definition and quality, carries the connected
account's ISO store currency, and formats prices with `Intl.NumberFormat`.
Listing counts appear beside the existing selected-item price providers and
are explicitly labelled as a GC market summary rather than a live order book.

Expose the TF2 GC's local-currency market summary alongside existing external
price providers. This gives listing counts and local prices by definition and
quality.

Evidence:

- `CMsgGCClientMarketDataRequest`;
- `CMsgGCClientMarketData` and `CMsgGCClientMarketDataEntry`;
- EMsgs 1080/1081.

The UI must label this as GC market summary data rather than a live buy-order
book or Backpack.tf valuation.

### 8. Backpack organization

Complete GC-backed sorting, explicit positions, pickup acknowledgement, and
new-item grouping.

Evidence:

- `CMsgSortItems`;
- `CMsgSetItemPositions`;
- `CMsgItemAcknowledged`;
- EMsgs 1041, 1058, 1062, and 1100.

### 9. Carefully staged legacy economy operations

Possible later additions include naming/removing names, painting/removing
paint, styles, gift wrapping/delivery/unwrapping, collection upgrades,
Halloween offerings, common Stat Clocks, Festivizer removal, and store
transactions.

The EMsg list is not sufficient by itself. In particular, the tracked TF2
source exposes ordinary crafting and crate-unlock message IDs without a current
request protobuf body. Those encoders must remain capture-gated; no legacy
binary struct should be guessed.

## Suggested priority

1. CS2 and TF2 loadout editors.
2. CS2 and TF2 inspect resolvers.
3. Cross-game match/performance dashboards.
4. Steam profile-cosmetic organizer and account-wide read-only context.
5. New-item/activity inboxes.
6. CS2/TF2 progression dashboards.
7. Steam unified inventory diagnostics.
8. Rental, quest, acknowledgement, and legacy economy mutations only after
   capture and validation.

This ordering favors reversible or read-only features with complete protobuf
definitions and clear authoritative reconciliation paths.
