import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defineQuestions } from "./defineQuestions.js";
import { CANCELLED, createCannedRenderer } from "./renderer.js";
import type { Renderer } from "./renderer.js";

describe("defineQuestions - tasks", () => {
  it("throws eagerly for a non-positive timeoutMs", () => {
    expect(() =>
      defineQuestions({
        questions: { name: { schema: z.string(), message: "Name?" } },
        tasks: {
          work: { message: "Work", timeoutMs: 0, run: async () => {} },
        },
      }),
    ).toThrow(/positive/);
  });

  it("runs after every question, in declaration order, sharing the answers object", async () => {
    const seenAnswers: unknown[] = [];
    const flow = defineQuestions({
      questions: { name: { schema: z.string(), message: "Name?" } },
      tasks: {
        first: {
          message: "First",
          schema: z.string(),
          run: async () => "first-result",
        },
        second: {
          message: "Second",
          schema: z.string(),
          when: (answers) => {
            seenAnswers.push({ ...answers });
            return true;
          },
          run: async () => "second-result",
        },
      },
    });

    const renderer = createCannedRenderer(["Ada"]);
    const result = await flow.ask({ renderer });

    expect(result).toEqual({
      success: true,
      data: { name: "Ada", first: "first-result", second: "second-result" },
    });
    expect(seenAnswers).toEqual([{ name: "Ada", first: "first-result" }]);
  });

  it("skips a task when when() returns false, leaving its key absent", async () => {
    const flow = defineQuestions({
      questions: {
        role: { schema: z.enum(["admin", "member"]), message: "Role?" },
      },
      tasks: {
        adminSetup: {
          message: "Admin setup",
          when: (answers) => answers.role === "admin",
          schema: z.string(),
          run: async () => "setup-done",
        },
      },
    });

    const renderer = createCannedRenderer(["member"]);
    const result = await flow.ask({ renderer });

    expect(result).toEqual({ success: true, data: { role: "member" } });
  });

  it("stores undefined for a task with no schema, regardless of what run() returns", async () => {
    const flow = defineQuestions({
      questions: { name: { schema: z.string(), message: "Name?" } },
      tasks: {
        sideEffect: {
          message: "Doing a thing",
          run: async () => "ignored return value",
        },
      },
    });

    const renderer = createCannedRenderer(["Ada"]);
    const result = await flow.ask({ renderer });

    expect(result).toEqual({
      success: true,
      data: { name: "Ada", sideEffect: undefined },
    });
  });

  it("fails with a validation error when the task result doesn't match its schema", async () => {
    const flow = defineQuestions({
      questions: { name: { schema: z.string(), message: "Name?" } },
      tasks: {
        check: {
          message: "Check",
          schema: z.number(),
          run: async () => "not-a-number",
        },
      },
    });

    const renderer = createCannedRenderer(["Ada"]);
    const result = await flow.ask({ renderer });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.kind).toBe("validation");
      expect(result.error.step).toBe("check");
    }
  });

  it("passes update() through to the renderer", async () => {
    const updates: string[] = [];
    const flow = defineQuestions({
      questions: { name: { schema: z.string(), message: "Name?" } },
      tasks: {
        work: {
          message: "Working...",
          schema: z.string(),
          run: async ({ update }) => {
            update("step 1");
            update("step 2");
            return "done";
          },
        },
      },
    });

    const renderer: Renderer = {
      ...createCannedRenderer(["Ada"]),
      task: async ({ run, signal }) =>
        run({ update: (msg) => updates.push(msg), signal }),
    };
    const result = await flow.ask({ renderer });

    expect(result).toEqual({
      success: true,
      data: { name: "Ada", work: "done" },
    });
    expect(updates).toEqual(["step 1", "step 2"]);
  });

  it("fails with a cancelled error when the renderer reports cancellation", async () => {
    const flow = defineQuestions({
      questions: { name: { schema: z.string(), message: "Name?" } },
      tasks: {
        work: { message: "Working...", run: async () => "unreachable" },
      },
    });

    const renderer: Renderer = {
      ...createCannedRenderer(["Ada"]),
      task: async () => CANCELLED,
    };
    const result = await flow.ask({ renderer });

    expect(result).toEqual({
      success: false,
      error: {
        kind: "cancelled",
        message: "Cancelled.",
        issues: [],
        step: "work",
      },
    });
  });

  it("fails with a failed error when run() throws", async () => {
    const flow = defineQuestions({
      questions: { name: { schema: z.string(), message: "Name?" } },
      tasks: {
        work: {
          message: "Working...",
          run: async () => {
            throw new Error("boom");
          },
        },
      },
    });

    const renderer = createCannedRenderer(["Ada"]);
    const result = await flow.ask({ renderer });

    expect(result).toEqual({
      success: false,
      error: { kind: "failed", message: "boom", issues: [], step: "work" },
    });
  });

  it("fails with a timeout error when run() outlasts timeoutMs, and aborts the signal", async () => {
    let aborted = false;
    const flow = defineQuestions({
      questions: { name: { schema: z.string(), message: "Name?" } },
      tasks: {
        work: {
          message: "Working...",
          timeoutMs: 20,
          run: ({ signal }) =>
            new Promise((_resolve, reject) => {
              signal.addEventListener("abort", () => {
                aborted = true;
                reject(new Error("aborted"));
              });
            }),
        },
      },
    });

    const renderer = createCannedRenderer(["Ada"]);
    const result = await flow.ask({ renderer });

    expect(result).toEqual({
      success: false,
      error: {
        kind: "timeout",
        message: 'Task "work" timed out.',
        issues: [],
        step: "work",
      },
    });
    // Give the aborted run()'s rejection a tick to land before asserting.
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(aborted).toBe(true);
  });
});
