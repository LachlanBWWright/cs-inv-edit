export function formatItemId(id: string): string {
  return id.replace(/(.{4})/g, "$1 ").trim();
}

export function formatTimestamp(value?: string): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export function formatKind(kind: string): string {
  return kind.replace(/_/g, " ");
}
