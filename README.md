# cs-inv-edit

A responsive SolidJS control surface for managing Counter-Strike inventory edits with account-scoped inventory workflows, inline rename controls, and backend-driven operation receipts.

## Platform shells

- **Web**: SolidJS + Vite + Tailwind CSS
- **Desktop**: Electron shell around the shared web build
- **Mobile**: Capacitor wrapper around the shared web build

## Quality gates

- `pnpm lint`
- `pnpm test`
- `pnpm build`
- `pnpm desktop:dev`
- `pnpm mobile:sync`

## UI documentation

The UI design rationale lives in `/docs/ui` and the captured review screenshots live in `/docs/ui/screenshots`.
