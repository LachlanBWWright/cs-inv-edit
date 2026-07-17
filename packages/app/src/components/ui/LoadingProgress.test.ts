import { describe, expect, it } from "vitest";
import { formatLoadingDuration, loadingStageIndex, type LoadingStage } from "./loading-progress-utils.js";

const stages: LoadingStage[] = [
  { afterSeconds: 0, label: "First", detail: "" },
  { afterSeconds: 10, label: "Second", detail: "" },
  { afterSeconds: 30, label: "Third", detail: "" },
];

describe("LoadingProgress helpers", () => {
  it("advances through elapsed-time feedback stages", () => {
    expect(loadingStageIndex(stages, 0)).toBe(0);
    expect(loadingStageIndex(stages, 15)).toBe(1);
    expect(loadingStageIndex(stages, 90)).toBe(2);
  });

  it("formats short and long waits", () => {
    expect(formatLoadingDuration(9)).toBe("9s");
    expect(formatLoadingDuration(75)).toBe("1m 15s");
  });
});
