export function formatTimestamp(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

export function formatDateTime(value: string | number): string {
  const date = new Date(
    typeof value === "number" && value < 10_000_000_000
      ? value * 1_000
      : value,
  );
  return Number.isNaN(date.getTime())
    ? String(value)
    : new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
}

export function formatItemId(id: string): string {
  return id.length > 16 ? `${id.slice(0, 12)}…${id.slice(-4)}` : id;
}

export function formatState(state: string): string {
  return state.replace(/_/g, " ");
}

export function formatStateLabel(state: string): string {
  return formatState(state).replace(/\b\w/g, (letter) => letter.toUpperCase());
}
