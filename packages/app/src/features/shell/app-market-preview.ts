import type { ConnectionStatus, RelatedItemDto } from "@cs-inv-edit/contracts";
import type { LocalAgentClient } from "../../shared/lib/backend.js";

export function createMarketPreviewRequester(backend: LocalAgentClient) {
  const cache = new Map<string, Promise<RelatedItemDto | undefined>>();
  return (marketName: string) => {
    const cached = cache.get(marketName);
    if (cached) return cached;
    const request = backend
      .marketPreview(marketName)
      .match(
        (preview) => preview,
        () => undefined,
      )
      .then((preview) => {
        if (!preview) cache.delete(marketName);
        return preview;
      });
    cache.set(marketName, request);
    return request;
  };
}

export function logSteamDiagnostics(label: string, status?: ConnectionStatus) {
  if (!status?.diagnostics?.length) return;
  console.groupCollapsed(`[steam] ${label} diagnostics`);
  for (const line of status.diagnostics) console.info(line);
  console.groupEnd();
}
