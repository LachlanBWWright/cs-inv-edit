# cs-inv-edit

A responsive SolidJS control surface for managing Counter-Strike inventory edits with account-scoped inventory workflows, inline rename controls, and backend-driven operation receipts.

## Service architecture

The application uses two independent services:

- **Local Agent** (`cs2-backend`, port `7331`): runs per user and owns Steam authentication, GC/protobuf sessions, authoritative inventory, trades, purchases, and item mutations.
- **Shared Data Service** (`data-service`, port `7332`): centrally fetches and caches non-user-specific marketplace pricing. It does not receive Steam credentials, asset IDs, or complete inventories.

The web, desktop, and WASM shells query the Shared Data Service directly through a separately validated client. Set `VITE_DATA_SERVICE_URL` at build time to select its public origin; local development defaults to `http://127.0.0.1:7332`. Provider credentials such as `CSFLOAT_API_KEY` belong only to the Shared Data Service environment. Production deployments should set `CSINV_DATA_ALLOWED_ORIGINS` to the comma-separated browser-origin allowlist.

For local development, `./scripts/run.sh web` watches and independently restarts the two Go services while Vite runs. A successful `cs2-backend` login is restored after a rebuild from a permission-restricted credential file in the OS user config directory. Set `CSINV_STEAM_SESSION_PERSISTENCE=disabled` to opt out, or `CSINV_STEAM_SESSION_FILE` to override its location. Explicitly disconnecting Steam removes the saved credential. The connected web and desktop shells share this native local-agent behavior; WASM web/mobile mode does not currently implement Steam CM or GC authentication and never stores Steam credentials in browser storage.

## Platform shells

- **Web**: SolidJS + Vite + Tailwind CSS
- **Desktop**: Electron shell around the shared web build
- **Mobile**: Capacitor wrapper around the shared web build

## Repository layout

- `apps/web`: browser and Capacitor web entry point
- `apps/desktop`: Electron main, preload, and renderer entry points
- `packages/app`: shared Solid application, organized into feature modules and shared UI/infrastructure
- `packages/contracts`: generated API bindings plus application-level contract schemas
- `backend/cmd`: executable entry points for the local agent, data service, and WASM backend
- `backend/internal`: application, domain, economy, protocol, and Steam adapter packages
- `api`: authoritative OpenAPI specifications and Go generator configuration
- `proto`: authoritative protobuf inputs and pinned upstream submodules
- `docs`: maintained architecture, protocol, metadata, and UI documentation
- `research`: local research captures; potentially sensitive logs are ignored

## Quality gates

- `pnpm lint`
- `pnpm test`
- `pnpm build`
- `pnpm dev:desktop`
- `pnpm build:android`

## UI documentation

The UI design rationale lives in `/docs/ui` and the captured review screenshots live in `/docs/ui/screenshots`.
