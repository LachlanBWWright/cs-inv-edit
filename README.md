# cs-inv-edit

A responsive SolidJS control surface for managing Counter-Strike inventory edits with account-scoped inventory workflows, inline rename controls, and backend-driven operation receipts.

## Service architecture

The application uses two independent services:

- **Local Agent** (`cs2-backend`, port `7331`): runs per user and owns Steam authentication, GC/protobuf sessions, authoritative inventory, trades, purchases, and item mutations.
- **Shared Data Service** (`data-service`, port `7332`): centrally fetches and caches non-user-specific marketplace pricing. It does not receive Steam credentials, asset IDs, or complete inventories.

The web, desktop, and WASM shells query the Shared Data Service directly through a separately validated client. Set `VITE_DATA_SERVICE_URL` at build time to select its public origin; local development defaults to `http://127.0.0.1:7332`. Provider credentials such as `CSFLOAT_API_KEY` belong only to the Shared Data Service environment. Production deployments should set `CSINV_DATA_ALLOWED_ORIGINS` to the comma-separated browser-origin allowlist.

For local development, `./scripts/run.sh web` builds and starts both Go services before Vite. They can also be built independently with `pnpm build:backend` and `pnpm build:data-service`.

## Platform shells

- **Web**: SolidJS + Vite + Tailwind CSS
- **Desktop**: Electron shell around the shared web build
- **Mobile**: Capacitor wrapper around the shared web build

## Quality gates

- `pnpm lint`
- `pnpm test`
- `pnpm build`
- `pnpm dev:desktop`
- `pnpm build:android`

## UI documentation

The UI design rationale lives in `/docs/ui` and the captured review screenshots live in `/docs/ui/screenshots`.
