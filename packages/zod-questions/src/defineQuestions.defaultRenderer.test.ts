import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

// Exercises defineQuestions.ts's lazy-loaded fallback (ask() called with no renderer)
// against a mocked @clack/prompts, so it never touches a real terminal.
vi.mock("@clack/prompts", () => ({
  text: vi.fn().mockResolvedValue("Ada"),
  confirm: vi.fn(),
  select: vi.fn(),
  multiselect: vi.fn(),
  password: vi.fn(),
  isCancel: () => false,
}));

const { defineQuestions } = await import("./defineQuestions.js");
const clack = await import("@clack/prompts");

describe("defineQuestions - default renderer", () => {
  it("lazily loads and uses the clack-backed renderer when ask() is called with none", async () => {
    const flow = defineQuestions({
      questions: { name: { schema: z.string(), message: "Name?" } },
    });

    const result = await flow.ask();

    expect(result).toEqual({ success: true, data: { name: "Ada" } });
    expect(clack.text).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Name?" }),
    );
  });
});
