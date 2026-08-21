# SolidJS component stories

The shared SolidJS application package uses Storybook with the
`storybook-solidjs-vite` renderer. Stories render production components without
starting the Go backend, which makes deterministic UI states suitable for
component development and screenshots.

Run the interactive component explorer from the repository root:

```sh
pnpm storybook
```

Build the static Storybook site:

```sh
pnpm storybook:build
```

Generate the inventory-grid screenshot:

```sh
pnpm --filter @cs-inv-edit/app exec playwright install chromium
pnpm storybook:screenshot
```

The screenshot command starts Storybook, discovers every indexed story, renders
each at a fixed 1440 × 900 viewport, disables motion, and writes one PNG per
story under `packages/app/artifacts/storybook`. It removes obsolete PNGs before
capturing, uses a bounded worker pool, and requires visible story content before
accepting a capture. Generated Storybook and screenshot output is ignored by
Git.

The fixture in `InventoryItemGrid.stories.tsx` is intentionally local mock data.
It uses the generated `InventoryItemDto` contract, so API contract changes are
caught by TypeScript without requiring live Steam inventory access or retaining
account data in screenshots.

Current stories cover shared controls and feedback, account introduction,
inventory item states, commerce pricing and ROI states, Armory lifecycle states,
CS2 progression, TF2 item effects, operation activity, and Steam trade items.
Add new stories next to their production components; screenshot coverage is
automatic because the runner reads Storybook's generated story index.

CI builds Storybook, captures the same deterministic story, and publishes the
PNG in the `storybook-screenshots` workflow artifact.
