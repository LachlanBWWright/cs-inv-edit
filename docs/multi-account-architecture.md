# Multi-account architecture

## Outcome

The backend must own several authenticated Steam sessions concurrently. An account is a data-ownership boundary, not a frontend filter. Every inventory snapshot, GC request, web token, trade, operation, cache entry, and refresh job must carry a SteamID and resolve through an account session.

The first implemented consumer is Steam trade history. `GET /trade-accounts` returns account-labelled snapshots, and `POST /trade-accounts` refreshes every available session. Passing `steamId` refreshes one session. The History UI can show all available accounts or one account and retains the owner label on every trade.

## Session model

`Service` is evolving from one global Steam connection into a registry:

```text
SteamSessionManager
├── activeSteamId                 UI and mutation default only
└── sessions[steamId]
    ├── connection/profile
    ├── dedicated GC transport
    ├── web access token
    ├── CS2/TF2/Dota/Steam snapshots
    ├── armory/store snapshots
    ├── trade snapshot
    ├── operations and refresh epochs
    └── cancellation/lifecycle state
```

Each authenticated account uses a dedicated `GCClient`. Adding or selecting another account must not close existing clients. Explicit sign-out closes and removes only the addressed session. “Active” selects the default account for account-local mutations; it does not determine which sessions remain alive or readable.

## API direction

Account collection routes should use `/accounts` and account resources should use `/accounts/{steamId}/…`. During migration, existing unscoped routes remain aliases for the active account.

| Capability     | Collection/all accounts    | One account                                  |
| -------------- | -------------------------- | -------------------------------------------- |
| Sessions       | `GET /accounts`            | `GET/DELETE /accounts/{steamId}`             |
| Activation     | —                          | `POST /accounts/{steamId}/activate`          |
| Trade history  | `GET/POST /trade-accounts` | `POST /trade-accounts?steamId=…`             |
| CS2 inventory  | future aggregate read      | `/accounts/{steamId}/inventory`              |
| Game inventory | future aggregate read      | `/accounts/{steamId}/games/{game}/inventory` |
| Mutations      | never implicit aggregate   | `/accounts/{steamId}/operations/{type}`      |

Aggregate responses must contain account envelopes rather than flattened assets. IDs such as GC item IDs and trade IDs are not global UI keys; use `(steamId, resourceId)`.

## State and concurrency rules

- Never store account-owned snapshots in a process-global singleton after migration. Store them inside the session that produced them.
- Capture the SteamID and session epoch before asynchronous work. Commit results only if that same session and epoch still exist.
- Refresh-all work should be bounded and cancellable. One account failure returns an error snapshot for that account without discarding successful peers.
- Mutations always require an explicit SteamID at the service boundary, even when an active-account compatibility route supplies it.
- A trade offer’s partner lookup and mutation token must come from the same owning session as the offer snapshot.
- Frontend selection, filters, loading state, errors, and optimistic operations are keyed by SteamID. Changing the visible account must not clear another account’s selection or data.
- Credentials and refresh/web tokens remain backend-only. Persisted session restoration should use OS-protected credential storage, never localStorage.

## Migration plan

1. **Trade read foundation (started):** introduce the backend session registry, account-labelled trade collection contract, all/one refresh, and account selector.
2. **Session lifecycle:** add list, activate, and targeted sign-out routes; make password and QR login add a session without replacing an existing one; expose per-account health.
3. **Move snapshots:** relocate inventory, multi-game inventory, armory, store, refresh counters, and cancellation contexts into `steamAccountSession`.
4. **Scope operations:** require SteamID for every GC/web mutation and keep receipts/events account-labelled.
5. **Frontend stores:** replace singleton resources with maps keyed by SteamID and add all/one inventory presentation. Preserve per-account filters and selections.
6. **Restoration and limits:** add protected token persistence, startup restoration, bounded concurrent logons/refreshes, backoff, and per-account diagnostics.
7. **Remove compatibility aliases:** after every caller is account-aware, remove singleton fields and unscoped routes.

## Current limitations

Trade reads now have an account-aware contract and the backend keeps dedicated transports for successfully added sessions. The rest of the service still uses active-account compatibility aliases (`gcClient`, `inventory`, `armory`, and `store`). Session list/activation routes and targeted sign-out are the next required slice before inventories can safely render several accounts simultaneously. Process restart restoration is also not implemented yet.

## Test strategy

- Unit-test that two sessions retain distinct transports, tokens, snapshots, and failure states.
- Race-test refresh-all alongside targeted sign-out and activation.
- Contract-test empty, partial-failure, and multi-account envelopes.
- UI-test all-account sorting and owner badges, then one-account filtering.
- Keep live Steam and GC calls out of automated tests; inject transport and trade-provider fakes.
