import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { defineQuestions } from "./defineQuestions.js";
import { CANCELLED, createCannedRenderer } from "./renderer.js";
import type { Renderer } from "./renderer.js";

function interactiveCannedRenderer(queue: unknown[]): Renderer {
  return { ...createCannedRenderer(queue), interactive: true };
}

describe("defineQuestions", () => {
  it("throws with no questions", () => {
    expect(() => defineQuestions({ questions: {} })).toThrow(/at least 1/);
  });

  it("throws eagerly for a misconfigured question, before any asking happens", () => {
    expect(() =>
      defineQuestions({
        questions: { tags: { schema: z.array(z.string()), message: "Tags?" } },
      }),
    ).toThrow(/multiselect/);
  });

  it("answers every widget kind and returns typed data", async () => {
    const flow = defineQuestions({
      questions: {
        name: { schema: z.string().min(1), message: "Name?" },
        age: { schema: z.coerce.number().int().positive(), message: "Age?" },
        role: { schema: z.enum(["admin", "member"]), message: "Role?" },
        tags: {
          schema: z.array(z.enum(["a", "b", "c"])),
          message: "Tags?",
          multiselect: true,
        },
        notify: { schema: z.boolean().default(true), message: "Notify?" },
        apiKey: {
          schema: z.string().min(1),
          message: "API key?",
          secret: true,
        },
      },
    });

    const renderer = createCannedRenderer([
      "Ada",
      "30",
      "admin",
      ["a", "b"],
      true,
      "secret123",
    ]);
    const result = await flow.ask({ renderer });

    expect(result).toEqual({
      success: true,
      data: {
        name: "Ada",
        age: 30,
        role: "admin",
        tags: ["a", "b"],
        notify: true,
        apiKey: "secret123",
      },
    });
  });

  it("skips a question when when() returns false, in insertion order", async () => {
    const flow = defineQuestions({
      questions: {
        role: { schema: z.enum(["admin", "member"]), message: "Role?" },
        note: {
          schema: z.string(),
          message: "Note?",
          when: (answers) => answers.role === "admin",
        },
      },
    });

    const renderer = createCannedRenderer(["member"]);
    const result = await flow.ask({ renderer });

    expect(result).toEqual({ success: true, data: { role: "member" } });
  });

  it("resolves a blank answer to an optional question as undefined", async () => {
    const flow = defineQuestions({
      questions: {
        nickname: { schema: z.string().optional(), message: "Nickname?" },
      },
    });

    const renderer = createCannedRenderer([""]);
    const result = await flow.ask({ renderer });

    expect(result).toEqual({ success: true, data: { nickname: undefined } });
  });

  it("resolves a blank answer to a defaulted question as the configured default", async () => {
    const flow = defineQuestions({
      questions: {
        registry: {
          schema: z.string().default("https://registry.npmjs.org"),
          message: "Registry?",
        },
      },
    });

    const renderer = createCannedRenderer([""]);
    const result = await flow.ask({ renderer });

    expect(result).toEqual({
      success: true,
      data: { registry: "https://registry.npmjs.org" },
    });
  });

  it("fails with a validation error when a canned answer is invalid (nobody to reprompt)", async () => {
    const flow = defineQuestions({
      questions: {
        age: { schema: z.coerce.number().int().positive(), message: "Age?" },
      },
    });

    const renderer = createCannedRenderer(["not-a-number"]);
    const result = await flow.ask({ renderer });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.kind).toBe("validation");
      expect(result.error.step).toBe("age");
    }
  });

  it("fails with a cancelled error when the renderer reports cancellation", async () => {
    const flow = defineQuestions({
      questions: { name: { schema: z.string(), message: "Name?" } },
    });

    const renderer = createCannedRenderer([CANCELLED]);
    const result = await flow.ask({ renderer });

    expect(result).toEqual({
      success: false,
      error: {
        kind: "cancelled",
        message: "Cancelled.",
        issues: [],
        step: "name",
      },
    });
  });

  it("skips prompting when a valid prefilled value is given", async () => {
    const flow = defineQuestions({
      questions: { name: { schema: z.string(), message: "Name?" } },
    });

    const renderer = createCannedRenderer([]);
    const result = await flow.ask({ renderer, prefilled: { name: "Ada" } });

    expect(result).toEqual({ success: true, data: { name: "Ada" } });
  });

  it("fails immediately on an invalid prefilled value under a non-interactive renderer", async () => {
    const flow = defineQuestions({
      questions: {
        age: { schema: z.coerce.number().int().positive(), message: "Age?" },
      },
    });

    const renderer = createCannedRenderer([]);
    const result = await flow.ask({ renderer, prefilled: { age: -5 } });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.kind).toBe("validation");
      expect(result.error.step).toBe("age");
    }
  });

  it("falls through to a live prompt on an invalid prefilled value under an interactive renderer", async () => {
    const flow = defineQuestions({
      questions: {
        age: { schema: z.coerce.number().int().positive(), message: "Age?" },
      },
    });

    const renderer = interactiveCannedRenderer(["25"]);
    const result = await flow.ask({ renderer, prefilled: { age: -5 } });

    expect(result).toEqual({ success: true, data: { age: 25 } });
  });

  it("passes a validate() callback to text/password widgets matching the schema", async () => {
    const seenErrors: (string | undefined)[] = [];
    let textCalls = 0;
    const flow = defineQuestions({
      questions: {
        age: { schema: z.coerce.number().int().positive(), message: "Age?" },
        nickname: { schema: z.string().optional(), message: "Nickname?" },
      },
    });

    const renderer: Renderer = {
      interactive: true,
      text: async (opts) => {
        textCalls += 1;
        if (textCalls === 1) {
          // "age"
          seenErrors.push(opts.validate?.("not-a-number"));
          seenErrors.push(opts.validate?.("30"));
          return "30";
        }
        // "nickname" - blank is valid since it's optional
        seenErrors.push(opts.validate?.(""));
        return "";
      },
      confirm: async () => true,
      select: async () => "",
      multiselect: async () => [],
      password: async () => "",
      task: async ({ run, signal }) => run({ update: () => {}, signal }),
    };

    const result = await flow.ask({ renderer });

    expect(result).toEqual({
      success: true,
      data: { age: 30, nickname: undefined },
    });
    expect(seenErrors[0]).toMatch(/expected number|invalid/i);
    expect(seenErrors[1]).toBeUndefined();
    expect(seenErrors[2]).toBeUndefined();
  });

  it("runs a cross-field override schema built on answersSchema", async () => {
    const flow = defineQuestions({
      questions: {
        min: { schema: z.coerce.number(), message: "Min?" },
        max: { schema: z.coerce.number(), message: "Max?" },
      },
    });
    const overrideSchema = flow.answersSchema.transform((raw, ctx) => {
      if (raw.min > raw.max) {
        ctx.addIssue({ code: "custom", message: "min must be <= max" });
        return z.NEVER;
      }
      return raw;
    });

    const renderer = createCannedRenderer(["10", "5"]);
    const result = await flow.ask({ renderer }, overrideSchema);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toContain("min must be <= max");
    }
  });

  it("returns the override schema's own data shape when it passes", async () => {
    const flow = defineQuestions({
      questions: {
        min: { schema: z.coerce.number(), message: "Min?" },
        max: { schema: z.coerce.number(), message: "Max?" },
      },
    });
    const overrideSchema = flow.answersSchema.transform(({ min, max }) => ({
      range: [min, max] as const,
    }));

    const renderer = createCannedRenderer(["1", "5"]);
    const result = await flow.ask({ renderer }, overrideSchema);

    expect(result).toEqual({ success: true, data: { range: [1, 5] } });
  });

  it("askOrExit returns data directly on success", async () => {
    const flow = defineQuestions({
      questions: { name: { schema: z.string(), message: "Name?" } },
    });

    const renderer = createCannedRenderer(["Ada"]);
    const data = await flow.askOrExit({ renderer });

    expect(data).toEqual({ name: "Ada" });
  });

  it("askOrExit prints the error and exits 1 on failure", async () => {
    const flow = defineQuestions({
      questions: { name: { schema: z.string(), message: "Name?" } },
    });

    const renderer = createCannedRenderer([CANCELLED]);
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("exit called");
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(flow.askOrExit({ renderer })).rejects.toThrow("exit called");
    expect(errorSpy).toHaveBeenCalledWith("Cancelled.");
    expect(exitSpy).toHaveBeenCalledWith(1);

    exitSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
