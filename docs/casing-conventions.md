# Casing conventions

## TypeScript and SolidJS

- Use `camelCase` for variables, functions, signals, accessors, and props.
- Treat abbreviations as words inside identifiers: `appId`, `backendUrl`,
  `parseJson`, and `steamMarketUrl`.
- Use `PascalCase` for types and Solid components, including initialisms that are
  part of product names such as `CS2LoadoutsView` and `TF2FeaturesView`.
- Use `UPPER_CASE` only for constants that are intentionally exposed as fixed
  configuration values.
- Name component modules after their primary component in `PascalCase`. Use
  kebab-case for utilities, controllers, models, and extracted component parts.
- Preserve external casing at compatibility boundaries, including generated API
  types, environment variables, JSON fields, DOM types, and third-party exports.

## Go

- Follow Go's standard mixedCaps convention. Capitalize common initialisms in
  identifiers: `ID`, `URL`, `HTTP`, `API`, `JSON`, `IP`, and `GC`.
- Use lowercase package names and snake_case Go filenames where multiple words
  improve readability.
- Preserve names required by generated protobuf/OpenAPI code and third-party
  types. Do not hand-edit generated or vendored files to change casing.

Run `pnpm --silent static-check` after changes. ESLint enforces the general
TypeScript identifier rules; code review covers acronym and filename semantics
that cannot be expressed safely without rejecting compatibility-boundary names.
