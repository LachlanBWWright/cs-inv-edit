export function isRefreshFailureState(state: string) {
  return (
    state === "failed" ||
    state === "requires_connection" ||
    state === "blocked_by_feature_flag"
  );
}
