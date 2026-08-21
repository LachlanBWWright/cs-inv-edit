export function isOption<T extends string>(
  value: string,
  options: readonly T[],
): value is T {
  const values: ReadonlySet<unknown> = new Set(options);
  return values.has(value);
}
