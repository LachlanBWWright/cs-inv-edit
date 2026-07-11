# Vendored Protobuf Sources

`gametracking-cs2/` is a Git submodule pointing at:

```text
https://github.com/SteamTracking/GameTracking-CS2.git
```

The CS2 protobuf source files live in:

```text
proto/vendor/gametracking-cs2/Protobufs/
```

Use those files as the local authoritative source for CS2 protobuf message structures, enum values, and field numbers. In particular:

- `Protobufs/base_gcmessages.proto` defines shared economy messages such as `CMsgOpenCrate`, `CMsgUseItem`, `CMsgApplyStatTrakSwap`, `CMsgApplyStrangePart`, and `CSOEconItem`.
- `Protobufs/econ_gcmessages.proto` defines economy GC EMsg enums such as `k_EMsgGCOpenCrate` and casket/storage/gift item operation IDs.
- `Protobufs/gcsdk_gcmessages.proto` defines base GC client session messages.
- `Protobufs/cstrike15_gcmessages.proto` defines CS2-specific GC messages that retain legacy CS:GO naming.

Do not infer binary layouts when a message exists in the submodule. If generated bindings need a smaller local subset, derive it mechanically from these files and regenerate; do not hand-edit generated Go output.
