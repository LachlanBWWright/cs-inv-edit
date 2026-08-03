export type UIActionOutcome =
  | { ok: true; message?: string }
  | { ok: false; message: string };
