const cs2InspectUrl =
  /^steam:\/\/(?:run|rungame)\/730\/[^/]*\/\+csgo_econ_action_preview%20/i;

export function swapScreenshotUrl(
  inspectUrl: string | undefined,
): string | undefined {
  if (!inspectUrl || !cs2InspectUrl.test(inspectUrl)) return undefined;
  return `https://swap.gg/cs2-inspects?inspectLink=${encodeURIComponent(inspectUrl)}`;
}
