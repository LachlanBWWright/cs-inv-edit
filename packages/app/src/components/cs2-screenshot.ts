const cs2InspectURL =
  /^steam:\/\/rungame\/730\/[^/]*\/\+csgo_econ_action_preview%20/i;

export function swapScreenshotURL(
  inspectURL: string | undefined,
): string | undefined {
  if (!inspectURL || !cs2InspectURL.test(inspectURL)) return undefined;
  return `https://swap.gg/cs2-inspects?inspectLink=${encodeURIComponent(inspectURL)}`;
}
