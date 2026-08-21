import { afterEach, describe, expect, it, vi } from "vitest";
import { createToastController } from "./controller.js";

describe("createToastController", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("adds and removes toast entries with a timeout", () => {
    vi.useFakeTimers();
    const controller = createToastController();

    controller.pushToast({ title: "Saved", description: "Updated settings" });
    expect(controller.toasts()).toHaveLength(1);

    vi.advanceTimersByTime(4000);
    expect(controller.toasts()).toHaveLength(0);
  });

  it("dismisses a toast immediately", () => {
    const controller = createToastController();

    controller.pushToast({ title: "Dismissed" });
    controller.dismissToast(controller.toasts()[0]?.id ?? "");

    expect(controller.toasts()).toHaveLength(0);
  });

  it("deduplicates repeated messages and limits the visible stack", () => {
    const controller = createToastController();

    controller.pushToast({ title: "Repeated", description: "Same message" });
    controller.pushToast({ title: "Repeated", description: "Same message" });
    controller.pushToast({ title: "Second" });
    controller.pushToast({ title: "Third" });
    controller.pushToast({ title: "Fourth" });

    expect(controller.toasts()).toHaveLength(3);
    expect(controller.toasts().map((toast) => toast.title)).toEqual([
      "Second",
      "Third",
      "Fourth",
    ]);
  });
});
