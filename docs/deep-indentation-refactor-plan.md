# Deep-indentation refactor plan

## Purpose

The repository's `find:deep-indentation` command identifies source files whose
non-markup lines reach five or more two-space indentation levels. It currently
reports 120 files and always exits successfully. This document describes how to
reduce that nesting without weakening lint rules, obscuring behavior, or making
one large high-risk rewrite.

The primary remedy is to break large UI files into cohesive components. Move
those components, their focused props contracts, and any component-specific
helpers into new files where appropriate. This is a structural refactor only:
functionality and user-visible behavior must not change.

Deep indentation is a useful signal, but not every reported line is a defect.
JSX formatting, fluent result combinators, object literals, and test fixtures can
all create indentation without increasing control-flow complexity. Each file
must therefore be reviewed before it is changed.

## Desired outcome

- Production control flow stays within three logical nesting levels.
- Components and functions have one clear responsibility.
- Extracted UI state remains attached to complete, stable entity identities.
- TypeScript boundary failures continue to use `neverthrow` rather than
  `try`/`catch` or rejecting-promise recovery.
- Existing behavior, accessibility attributes, responsive behavior, and tests
  remain intact.
- Every modified or newly created source file remains below the configured
  400-line limit. Do not fix one oversized file by moving its contents into a
  different oversized file.
- CI prevents new indentation regressions and eventually enforces the agreed
  repository threshold.

## Current baseline

The first scan found 120 files at depth 5 or greater. The highest-priority files
are:

| Depth | File                                                                       |
| ----: | -------------------------------------------------------------------------- |
|    20 | `packages/app/src/features/tf2/TF2FeaturesView.tsx`                        |
|    19 | `packages/app/src/features/inventory/game-inventory-tf2-actions.tsx`       |
|    19 | `packages/app/src/features/shell/sidebar-mode-picker.tsx`                  |
|    18 | `packages/app/src/features/inventory/GameInventoryView.tsx`                |
|    18 | `packages/app/src/features/tf2/TF2CampaignsView.tsx`                       |
|    16 | `packages/app/src/features/commerce/terminal-item-section.tsx`             |
|    15 | `packages/app/src/features/settings/SettingsView.tsx`                      |
|    14 | `packages/app/src/features/cs2/CS2FeaturesPanel.tsx`                       |
|    14 | `packages/app/src/features/cs2/CS2LoadoutsView.tsx`                        |
|    14 | `packages/app/src/features/inventory/inventory-details-panel-sections.tsx` |
|    14 | `packages/app/src/features/shell/AppView.tsx`                              |

The scan should be rerun before each phase because ongoing refactors may change
the ordering.

## What counts as actionable nesting

Prioritize a finding when one or more of these conditions apply:

1. A function contains nested conditionals, loops, callbacks, or result matches.
2. A component owns unrelated state, data preparation, commands, and rendering.
3. A JSX branch contains another substantial list, dialog, toolbar, or panel.
4. Similar branches repeat transformations or action wiring.
5. Understanding a branch requires tracking state declared far from its use.

Do not extract code solely to reduce a number when the result would be a vague
wrapper, a large prop-forwarding component, or a helper that hides important
domain behavior.

## Component-first refactoring strategy

For TSX files, first identify independently meaningful visual regions and move
them into named components. Good extraction candidates include:

- page headers, status sections, and diagnostic lists;
- filters, sorting controls, and responsive navigation controls;
- inventory grids, cards, grouped lists, and inspectors;
- activity feeds, loadout panes, and campaign sections;
- dialogs, confirmation panels, and operation result summaries; and
- loading, empty, and error states that have their own behavior or layout.

Place extracted components beside their owning feature rather than in a global
shared directory unless they are genuinely reused across features. Each new
component should have a narrow, explicit props interface and should receive the
smallest complete domain values it needs. Avoid components that merely forward
a large page-level props object.

Before extracting, record the behavior that must remain unchanged, including:

- click, keyboard, selection, confirmation, and dismissal behavior;
- filtering, sorting, grouping, and stable item identity;
- loading, error, empty, and disabled states;
- responsive desktop/mobile presentation;
- accessibility labels, roles, focus behavior, and expanded state; and
- backend operation names and request payloads.

After extraction, compare these behaviors directly. Do not redesign controls,
remove options, change copy, alter defaults, or simplify workflows as part of
the indentation work.

## Supporting refactoring patterns

### Guard clauses

Replace nested precondition checks with early returns. For asynchronous
boundaries, return a typed `Result` or `ResultAsync` rather than throwing.

### Derived models

Move filtering, sorting, grouping, and compatibility calculations into small
pure modules. Keep Solid signals and effects in controller/model functions, and
keep presentation components focused on rendering their supplied model.

### Feature components

Extract independently meaningful UI regions such as activity feeds, inventory
grids, loadout panes, dialogs, inspectors, and filter toolbars. Give each
component an explicit props interface in the feature directory. Prefer a new
file when the extracted component has its own state, effects, handlers, or a
substantial render tree.

Check the projected size before extracting. The original file and every new
file must both remain below 400 lines after formatting. If an extraction would
create another near-limit file, split it by subcomponent responsibility during
the same change.

### Exhaustive operation dispatch

Replace nested string comparisons with discriminated unions and exhaustive
matching. Keep request construction beside the operation that owns it.

### Named result pipelines

Extract complex `andThen`, `mapErr`, and `match` callbacks into named,
single-purpose functions. Preserve `neverthrow` across fetch, storage, IPC,
JSON, and backend-client boundaries.

### Stable list identity

When splitting filtered or grouped lists, pass the rendered entity or its full
stable identity into handlers. Do not introduce displayed-array-index keys or
index-based action state.

## Phased execution

### Phase 1: improve the scanner

Before treating the script as a gate:

- Report the file, line number, indentation depth, and trimmed source preview.
- Distinguish control-flow indentation from JSX-only formatting where practical.
- Support a machine-readable output mode for CI comparisons.
- Document the selected threshold and exclusions in the script.
- Add tests for tabs, JSX, multiline object literals, generated paths, and test
  files.

Keep the CI step informational during this phase.

### Phase 2: establish a regression baseline

Record the maximum depth for each existing path in a checked-in baseline file.
CI should fail only when:

- a new file exceeds the threshold;
- an existing file becomes deeper than its baseline; or
- a remediated file regresses beyond its improved baseline.

This makes the check useful immediately without requiring a 120-file atomic
change. Baseline updates must be explicit and reviewed; the scanner must not
silently rewrite them during CI.

### Phase 3: refactor the highest-depth feature clusters

Work by cohesive feature area rather than raw depth alone:

1. **TF2 loadouts and campaigns** — separate item compatibility, grouped item
   grids, loadout slots, campaign activity, and operation submission.
2. **Inventory and TF2 actions** — separate action eligibility, confirmation
   state, request construction, and result presentation.
3. **Shell and navigation** — move mode selection, inventory controls, activity
   controls, account controls, and responsive navigation into distinct
   behavior-preserving components.
4. **CS2 panels and loadouts** — separate snapshot-derived models from activity
   and loadout presentation.
5. **Commerce and settings** — separate terminal offer state, purchase actions,
   settings sections, and validation.

Use one feature cluster per pull request where practical. Update the baseline
for every improved file in the same commit.

### Phase 4: address medium-depth production files

After the highest-depth group is stable, process depth 10–13 and then depth 7–9.
Prioritize frequently changed files and request paths before static display
components. Files at depth 5–6 should be changed only when the nesting represents
real complexity or when adjacent work already touches them.

### Phase 5: enable strict enforcement

Once remaining exceptions are understood, make `find:deep-indentation` return a
non-zero exit status for regressions. Keep any permanent exception narrow,
path-specific, and documented with why the structure is safe.

## Per-file workflow

For each candidate:

1. Capture its current maximum depth and the exact triggering lines.
2. Identify the responsibility represented by each nested region.
3. Check for existing shared controls, models, and feature components.
4. Write down the current functionality and interaction contract that must not
   change.
5. Add or identify tests that protect the affected behavior.
6. Extract one component responsibility at a time, moving it into a new file
   when it has a meaningful independent role.
7. Confirm both the source file and every extracted file remain below 400 lines
   after formatting.
8. Run formatting, lint, type checking, focused tests, and the indentation scan.
9. Inspect the diff for prop forwarding, lost accessibility attributes,
   unstable keys, and altered responsive behavior.
10. Update the baseline only after the file's new depth is verified.

## Verification requirements

Every refactor batch must pass:

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm find:deep-indentation
git diff --check
```

Feature-specific tests should also cover any extracted selection, filtering,
sorting, confirmation, loading, or error behavior. For UI changes, manually
verify desktop and mobile layouts and keyboard-accessible controls. Compare the
result against the pre-refactor UI to ensure the work changed structure only,
not functionality.

## Completion criteria

The work is complete when:

- the scanner reports actionable locations rather than only per-file maxima;
- CI blocks new or worsened indentation;
- all production files meet the agreed threshold or have reviewed,
  path-specific exceptions;
- all extracted and modified source files remain below 400 lines;
- component extraction has not changed user-visible behavior, available
  controls, operation payloads, or responsive interactions;
- the baseline is empty or contains only documented exceptions; and
- the full repository verification suite passes.
