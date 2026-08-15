import { describe, expect, it } from "vitest";
import { createCannedRenderer } from "./renderer.js";

describe("createCannedRenderer", () => {
  it("returns queued values in order across widget kinds", async () => {
    const renderer = createCannedRenderer(["Ada", true, "admin"]);
    expect(renderer.interactive).toBe(false);
    expect(await renderer.text({ message: "" })).toBe("Ada");
    expect(await renderer.confirm({ message: "" })).toBe(true);
    expect(await renderer.select({ message: "", options: [] })).toBe("admin");
  });

  it("throws once the queue is exhausted", async () => {
    const renderer = createCannedRenderer([]);
    await expect(renderer.text({ message: "" })).rejects.toThrow(
      /ran out of answers/,
    );
  });

  it("task() runs the real run() directly rather than pulling from the queue", async () => {
    const renderer = createCannedRenderer(["unrelated queued value"]);
    const controller = new AbortController();
    const result = await renderer.task({
      message: "Working...",
      signal: controller.signal,
      run: async ({ update, signal }) => {
        update("ignored, no-op in the canned renderer");
        expect(signal).toBe(controller.signal);
        return "real result";
      },
    });
    expect(result).toBe("real result");
  });
});
