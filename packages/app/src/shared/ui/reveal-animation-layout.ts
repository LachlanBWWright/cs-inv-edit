export function transformTranslateX(transform: string): number | undefined {
  const values = transform
    .match(/^matrix(?:3d)?\((.+)\)$/)?.[1]
    ?.split(",")
    .map((value) => Number.parseFloat(value.trim()));
  if (!values?.every(Number.isFinite)) return undefined;
  if (values.length === 6) return values[4];
  if (values.length === 16) return values[12];
  return undefined;
}
