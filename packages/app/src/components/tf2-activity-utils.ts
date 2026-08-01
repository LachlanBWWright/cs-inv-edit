export type TF2ActivityFilter = "all" | "matches" | "contracts" | "updates";

export const activityText = (value: unknown) =>
  value === undefined || value === null || value === ""
    ? undefined
    : String(value);

export const activityNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

export const firstActivityValue = (
  entry: Record<string, unknown>,
  keys: string[],
) => {
  for (const key of keys) {
    const value = activityText(entry[key]);
    if (value) return value;
  }
};

export const activityDateTime = (value: unknown) => {
  const raw = activityNumber(value);
  if (!raw) return undefined;
  const date = new Date(raw < 10_000_000_000 ? raw * 1_000 : raw);
  return Number.isNaN(date.valueOf())
    ? undefined
    : new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
};

export const activityLabel = (value: string) =>
  value
    .replace(/^k_?/i, "")
    .replaceAll("_", " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (letter) => letter.toUpperCase());

const hiddenProgressField = (key: string) =>
  /(^|_)(id|account|steam|definition|defindex|msg|version)($|_)/i.test(key);

export const progressFacts = (entries: Record<string, unknown>[]) =>
  entries.flatMap((entry) =>
    Object.entries(entry)
      .filter(
        ([key, value]) =>
          !hiddenProgressField(key) &&
          (typeof value === "number" || typeof value === "boolean"),
      )
      .slice(0, 4)
      .map(([key, value]) => ({ name: activityLabel(key), value })),
  );

const tf2Classes = [
  "Scout",
  "Sniper",
  "Soldier",
  "Demoman",
  "Medic",
  "Heavy",
  "Pyro",
  "Spy",
  "Engineer",
];

export const playedClasses = (value: unknown) => {
  const mask = activityNumber(value) ?? 0;
  return tf2Classes.filter((_, index) => (mask & (1 << index)) !== 0);
};

export const teamLabel = (value: unknown) => {
  const team = activityNumber(value);
  return team === 2 ? "RED" : team === 3 ? "BLU" : undefined;
};

export const medalLabel = (value: unknown) => {
  const medal = activityNumber(value);
  return medal === 3
    ? "Gold"
    : medal === 2
      ? "Silver"
      : medal === 1
        ? "Bronze"
        : undefined;
};
