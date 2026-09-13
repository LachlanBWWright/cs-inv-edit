import { Result } from "neverthrow";

export function isAllowedExternalUrl(raw: string): boolean {
  return Result.fromThrowable(
    () => new URL(raw),
    () => undefined,
  )().match(
    (url) => {
      if (url.protocol === "steam:")
        return (
          /^steam:\/\/(?:run|rungame)\/730\/[^/]*\/\+csgo_econ_action_preview%20[A-Za-z0-9._~-]+$/i.test(raw) ||
          /^steam:\/\/(?:run|rungame)\/440\/[^/]*\/\+tf_econ_item_preview%20[A-Za-z0-9._~-]+$/i.test(raw)
        );
      if (
        url.protocol !== "https:" ||
        url.username !== "" ||
        url.password !== "" ||
        url.hostname === ""
      )
        return false;
      const host = url.hostname.toLowerCase();
      if (/^[\d.:]+$/.test(host)) return false;
      return (
        host === "swap.gg" ||
        host === "steampowered.com" ||
        host.endsWith(".steampowered.com") ||
        host === "steamcommunity.com" ||
        host.endsWith(".steamcommunity.com")
      );
    },
    () => false,
  );
}
