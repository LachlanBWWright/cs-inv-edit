export function uniqueSortedStrings(values: Iterable<string | undefined>) {
  return [...new Set([...values].filter((value): value is string => !!value))].sort();
}
