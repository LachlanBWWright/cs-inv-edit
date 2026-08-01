# CS2 Store Purchase Protocol

This document records the sources and invariants used by the CS2 real-money
store implementation. It covers the public coupon checkout and the headless
Game Coordinator purchase path used for ordinary store products.

## Source hierarchy

Use these sources for different purposes:

1. [SteamTracking/GameTracking-CS2](https://github.com/SteamTracking/GameTracking-CS2/tree/master/Protobufs)
   and [SteamTracking/Protobufs](https://github.com/SteamTracking/Protobufs)
   are authoritative for protobuf definitions, field numbers, message IDs, and
   enums.
2. [Citrinate/CS2Interface](https://github.com/Citrinate/CS2Interface) is a
   useful, working reference for the orchestration of a headless CS2/Steam
   session. It is not authoritative for protobuf definitions.
3. Steamworks microtransaction documentation describes the public publisher
   API lifecycle, but CS2's GC performs the server-side initialization on
   Valve's behalf. The app must not call publisher-only endpoints without
   Valve credentials.

The CS2Interface behavior reviewed during implementation was revision
`266f04b6ece1eec8f3147cf14e49bf5d4a9c5012`. Re-check upstream behavior when
updating this flow.

## Coupon-only checkout

Valve supports browser purchases for coupon definitions through:

```text
https://store.steampowered.com/buyitem/730/<item-defindex>/<quantity>
```

Coupon eligibility comes from the live, prefab-merged `items_game.txt` schema,
not from a hard-coded defindex range or item name. A definition is eligible
when its Valve prefab chain identifies it as a coupon. This route must never be
used as a fallback for keys, name tags, storage units, terminal offers, or
other ordinary GC price-sheet products.

Unless `enableFullCs2Store` is enabled, the API returns only coupon offers and
purchases use this browser route. The feature flag exposes the broader
catalogue and routes it through the experimental GC flow below.

## Headless GC checkout

CS2 does not need to be installed or launched. The account does need access to
CS2, an authenticated Steam CM session, an active app-730 presence, and a CS2
GC session.

The working sequence, corroborated by CS2Interface, is:

1. Log on as a Steam client using an OS identity consistent with the actual
   runtime.
2. Send `EMsg_ClientGamesPlayedWithDataBlob` with app 730 and the same OS type.
3. Wait for presence routing to settle, send `CMsgClientHello` (`4006`), and
   receive `CMsgClientWelcome` (`4004`).
4. Send `CMsgGCStorePurchaseInit` (`2510`).
5. Receive `CMsgGCStorePurchaseInitResponse` (`2511`) from the GC.
6. Independently receive Steam `EMsg_ClientMicroTxnAuthRequest` (`5504`) on the
   CM connection.
7. Correlate its `orderid` with the GC response's `txn_id` and validate its
   nested `lineitems["0"]` against the requested item, quantity, and amount.
8. Use its separate 18-digit `transid` for the `approvetxn` checkout URL.

The `2511.txn_id` is normally a shorter GC order ID. It must not be inserted
into an `approvetxn` URL and it cannot be transformed arithmetically into the
Steam transaction ID.

The `5504` body is Binary KeyValues rather than protobuf. Its important shape
is:

```text
orderid
transid
appid
lineitems
  0
    gameitemid
    amount
    quantity
```

Preserve this nesting when decoding and logging it. A flattened decoder can
silently overwrite repeated fields and obscures which line item was validated.

## Purchase-init fields

The request is defined by `CMsgGCStorePurchaseInit` and
`CGCStorePurchaseInit_LineItem` in GameTracking-CS2's
`base_gcmessages.proto`. Current CS2Interface behavior sends:

- `country = ""`;
- the GC language ID;
- the GC economy currency ID;
- `item_def_id`;
- quantity;
- total local-currency cost for that quantity;
- no explicit `purchase_type` for an ordinary purchase;
- `supplemental_data`, including an explicit zero when none is required.

An accepted `2511` response does not by itself mean checkout is ready. The app
must wait for and correlate `5504`.

## Checkout completion

For a headless client, the approval URL should return through Steam's web
finalization endpoint for the GC order:

```text
https://store.steampowered.com/buyitem/730/finalize/<gc-order-id>
```

This differs from the native game overlay's short `returnurl=steam` form. The
native Steam client can deliver the authorization callback to the running game;
a headless browser flow needs an explicit web finalization handoff. The backend
may still send `CMsgGCStorePurchaseFinalize` (`2504`) during reconciliation,
but only after authorization. Result `5` means the order is not approved and
must not be treated as success.

## Diagnostics

Log both layers independently:

- every Steam CM EMsg, especially `5504`;
- every CS2 GC message, especially `2511` and `2505`;
- decoded Binary KeyValues objects with nested line items;
- runtime OS and Steam `client_os_type` used at authentication, logon, and
  games-played presence;
- the GC order ID and Steam transaction ID as separate labeled values.

Do not log credentials, refresh tokens, cookies, or payment details.
