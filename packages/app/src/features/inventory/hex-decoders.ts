function parseHex32(hex: string): number | undefined {
  const cleanHex = hex.replace(/^0x/i, "");
  if (cleanHex.length !== 8) return undefined;
  const num = parseInt(cleanHex, 16);
  return isNaN(num) ? undefined : num;
}

export function decodeHexToFloat(hex: string): number | undefined {
  const num = parseHex32(hex);
  if (num === undefined) return undefined;
  const view = new DataView(new ArrayBuffer(4));
  view.setUint32(0, num, false);
  const value = view.getFloat32(0, false);
  return isNaN(value) || !isFinite(value) ? undefined : value;
}

export function decodeLittleEndianHexToFloat(hex: string): number | undefined {
  const num = parseHex32(hex);
  if (num === undefined) return undefined;
  const view = new DataView(new ArrayBuffer(4));
  view.setUint32(0, num, true);
  const value = view.getFloat32(0, true);
  return isNaN(value) || !isFinite(value) ? undefined : value;
}

export function decodeLittleEndianHexToUint32(hex: string): number | undefined {
  const num = parseHex32(hex);
  if (num === undefined) return undefined;
  const view = new DataView(new ArrayBuffer(4));
  view.setUint32(0, num, true);
  return view.getUint32(0, true);
}
