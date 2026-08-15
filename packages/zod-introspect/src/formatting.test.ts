import { describe, expect, it } from "vitest";
import { joinWithConjunction } from "./formatting.js";

describe("joinWithConjunction", () => {
  it("returns a single item unchanged", () => {
    expect(joinWithConjunction(["a"], "or")).toBe("a");
  });

  it("returns an empty string for an empty list", () => {
    expect(joinWithConjunction([], "or")).toBe("");
  });

  it("joins two items with the conjunction, no comma", () => {
    expect(joinWithConjunction(["a", "b"], "or")).toBe("a or b");
    expect(joinWithConjunction(["a", "b"], "and")).toBe("a and b");
  });

  it("joins three or more items with a comma-separated list and the conjunction", () => {
    expect(joinWithConjunction(["a", "b", "c"], "or")).toBe("a, b, or c");
    expect(joinWithConjunction(["a", "b", "c", "d"], "and")).toBe(
      "a, b, c, and d",
    );
  });
});
