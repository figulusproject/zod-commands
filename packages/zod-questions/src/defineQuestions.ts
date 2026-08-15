import { z } from "zod";
import { isOptionalOrDefault } from "zod-introspect";
import type {
  AskResult,
  QuestionDescriptor,
  QuestionDescriptors,
  QuestionsIssue,
  TaskDescriptor,
  TaskDescriptors,
} from "./types.js";
import { enumOptions, multiselectOptions, widgetFor } from "./widgets.js";
import { CANCELLED } from "./renderer.js";
import type { Renderer } from "./renderer.js";

// Loaded lazily, only when ask() actually needs the fallback - @clack/prompts is an
// optional peer dependency, so a caller who always supplies their own renderer should
// never be required to have it installed.
async function defaultRenderer(): Promise<Renderer> {
  const { clackRenderer } = await import("./clackRenderer.js");
  return clackRenderer;
}

export type InferAnswers<TQuestions extends QuestionDescriptors> = {
  [K in keyof TQuestions]: z.infer<TQuestions[K]["schema"]>;
};

// A task without a schema always stores `undefined`, regardless of what run() returns.
export type InferTaskResults<TTasks extends TaskDescriptors> = {
  [K in keyof TTasks]: TTasks[K]["schema"] extends z.ZodType<infer T, any>
    ? T
    : undefined;
};

export type InferAll<
  TQuestions extends QuestionDescriptors,
  TTasks extends TaskDescriptors,
> = InferAnswers<TQuestions> & InferTaskResults<TTasks>;

export interface DefineQuestionsOptions<
  TQuestions extends QuestionDescriptors,
  TTasks extends TaskDescriptors,
> {
  questions: TQuestions;
  /** Run after every question, in declaration order, sharing the same when() mechanism. */
  tasks?: TTasks;
}

export interface AskOptions<TAnswers> {
  renderer?: Renderer;
  /** Skips prompting for any key present here. Falls back to a live prompt if a value fails its schema and `renderer.interactive` is true. */
  prefilled?: Partial<TAnswers>;
}

export interface QuestionsDefinition<
  TQuestions extends QuestionDescriptors,
  TTasks extends TaskDescriptors,
> {
  answersSchema: z.ZodObject<{
    [K in keyof TQuestions]: TQuestions[K]["schema"];
  }>;
  ask<TOut = InferAll<TQuestions, TTasks>>(
    options?: AskOptions<InferAnswers<TQuestions>>,
    overrideAnswersSchema?: z.ZodType<TOut, any>,
  ): Promise<AskResult<TOut>>;
  askOrExit<TOut = InferAll<TQuestions, TTasks>>(
    options?: AskOptions<InferAnswers<TQuestions>>,
    overrideAnswersSchema?: z.ZodType<TOut, any>,
  ): Promise<TOut>;
}

function toQuestionsIssues(error: z.ZodError): QuestionsIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path as (string | number)[],
    message: issue.message,
  }));
}

type AskOneOutcome =
  | { outcome: "cancelled" }
  | { outcome: "value"; value: unknown }
  | { outcome: "invalid"; issues: QuestionsIssue[] };

async function askOne(
  key: string,
  descriptor: QuestionDescriptor,
  renderer: Renderer,
): Promise<AskOneOutcome> {
  const widget = widgetFor(key, descriptor);
  const message = descriptor.message;
  const optional = isOptionalOrDefault(descriptor.schema);

  // For text/password, clack runs this inline and reprompts on its own before
  // ever returning to us - the safeParse below is the authoritative check either way.
  const validate = (raw: string | undefined): string | undefined => {
    const value = raw ?? "";
    if (value === "" && optional) return undefined;
    const result = descriptor.schema.safeParse(value);
    return result.success
      ? undefined
      : (result.error.issues[0]?.message ?? "Invalid input.");
  };

  let raw: unknown;
  switch (widget) {
    case "confirm":
      raw = await renderer.confirm({
        message,
        initialValue: descriptor.initialValue as boolean | undefined,
      });
      break;
    case "select":
      raw = await renderer.select({
        message,
        options: enumOptions(descriptor.schema, descriptor.labels),
        initialValue: descriptor.initialValue as string | undefined,
      });
      break;
    case "multiselect":
      raw = await renderer.multiselect({
        message,
        options: multiselectOptions(descriptor.schema, descriptor.labels),
        initialValues: descriptor.initialValue as string[] | undefined,
      });
      break;
    case "password":
      raw = await renderer.password({
        message,
        placeholder: descriptor.placeholder,
        validate,
      });
      break;
    default:
      raw = await renderer.text({
        message,
        placeholder: descriptor.placeholder,
        initialValue: descriptor.initialValue as string | undefined,
        validate,
      });
  }

  if (raw === CANCELLED) return { outcome: "cancelled" };

  if ((widget === "text" || widget === "password") && raw === "" && optional) {
    // Parsed through the schema rather than short-circuited to undefined, so a
    // .default(x) schema actually applies x on empty input, per normal zod semantics.
    const result = descriptor.schema.safeParse(undefined);
    return {
      outcome: "value",
      value: result.success ? result.data : undefined,
    };
  }

  const result = descriptor.schema.safeParse(raw);
  if (!result.success) {
    return { outcome: "invalid", issues: toQuestionsIssues(result.error) };
  }
  return { outcome: "value", value: result.data };
}

type AskTaskOutcome =
  | { outcome: "cancelled" }
  | { outcome: "value"; value: unknown }
  | { outcome: "invalid"; issues: QuestionsIssue[] }
  | { outcome: "timeout" }
  | { outcome: "failed"; message: string };

const TIMED_OUT = Symbol("zod-questions/timed-out");

async function askTask(
  descriptor: TaskDescriptor,
  renderer: Renderer,
  answers: Record<string, unknown>,
): Promise<AskTaskOutcome> {
  const controller = new AbortController();
  const taskPromise = renderer.task({
    message: descriptor.message,
    run: (ctx) => descriptor.run({ ...ctx, answers }),
    signal: controller.signal,
  });
  // A timeout wins the race below without waiting on taskPromise again - swallow a
  // later rejection here so it doesn't surface as an unhandled promise rejection.
  taskPromise.catch(() => {});

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = descriptor.timeoutMs
    ? new Promise<typeof TIMED_OUT>((resolve) => {
        timer = setTimeout(() => {
          controller.abort();
          resolve(TIMED_OUT);
        }, descriptor.timeoutMs);
      })
    : undefined;

  let raw: unknown;
  try {
    raw = timeoutPromise
      ? await Promise.race([taskPromise, timeoutPromise])
      : await taskPromise;
  } catch (err) {
    if (timer) clearTimeout(timer);
    return {
      outcome: "failed",
      message: err instanceof Error ? err.message : String(err),
    };
  }
  if (timer) clearTimeout(timer);

  if (raw === TIMED_OUT) return { outcome: "timeout" };
  if (raw === CANCELLED) return { outcome: "cancelled" };
  if (!descriptor.schema) return { outcome: "value", value: undefined };

  const result = descriptor.schema.safeParse(raw);
  if (!result.success) {
    return { outcome: "invalid", issues: toQuestionsIssues(result.error) };
  }
  return { outcome: "value", value: result.data };
}

export function defineQuestions<
  TQuestions extends QuestionDescriptors,
  TTasks extends TaskDescriptors = {},
>(
  def: DefineQuestionsOptions<TQuestions, TTasks>,
): QuestionsDefinition<TQuestions, TTasks> {
  const questions = def.questions;
  const keys = Object.keys(questions);
  if (keys.length === 0) {
    throw new Error(
      "zod-questions: defineQuestions() requires at least 1 question.",
    );
  }
  const tasks = def.tasks ?? ({} as TTasks);
  const taskKeys = Object.keys(tasks);

  // Eager misconfiguration checks (array without multiselect, etc.) - fail at
  // definition time rather than partway through a live session.
  for (const key of keys) widgetFor(key, questions[key]!);
  for (const key of taskKeys) {
    const timeoutMs = tasks[key]!.timeoutMs;
    if (timeoutMs !== undefined && timeoutMs <= 0) {
      throw new Error(
        `zod-questions: task "${key}" has timeoutMs: ${timeoutMs}, which must be a positive number.`,
      );
    }
  }

  const shape = Object.fromEntries(
    keys.map((key) => [key, questions[key]!.schema]),
  ) as { [K in keyof TQuestions]: TQuestions[K]["schema"] };
  const answersSchema = z.object(shape);

  async function askAll(
    renderer: Renderer,
    prefilled: Record<string, unknown> | undefined,
  ): Promise<AskResult<Record<string, unknown>>> {
    const answers: Record<string, unknown> = {};

    for (const key of keys) {
      const descriptor = questions[key]!;
      if (descriptor.when && !descriptor.when(answers)) continue;

      if (
        prefilled &&
        Object.prototype.hasOwnProperty.call(prefilled, key) &&
        prefilled[key] !== undefined
      ) {
        const result = descriptor.schema.safeParse(prefilled[key]);
        if (result.success) {
          answers[key] = result.data;
          continue;
        }
        if (!renderer.interactive) {
          const issues = toQuestionsIssues(result.error);
          return {
            success: false,
            error: {
              kind: "validation",
              message: `Prefilled value for "${key}" is invalid: ${issues[0]?.message ?? "invalid value"}`,
              issues,
              step: key,
            },
          };
        }
        // Bad prefilled value, but there's a live renderer - fall through and ask.
      }

      const outcome = await askOne(key, descriptor, renderer);
      if (outcome.outcome === "cancelled") {
        return {
          success: false,
          error: {
            kind: "cancelled",
            message: "Cancelled.",
            issues: [],
            step: key,
          },
        };
      }
      if (outcome.outcome === "invalid") {
        return {
          success: false,
          error: {
            kind: "validation",
            message: outcome.issues[0]?.message ?? "Invalid input.",
            issues: outcome.issues,
            step: key,
          },
        };
      }
      answers[key] = outcome.value;
    }

    for (const key of taskKeys) {
      const descriptor = tasks[key]!;
      if (descriptor.when && !descriptor.when(answers)) continue;

      const outcome = await askTask(descriptor, renderer, answers);
      if (outcome.outcome === "cancelled") {
        return {
          success: false,
          error: {
            kind: "cancelled",
            message: "Cancelled.",
            issues: [],
            step: key,
          },
        };
      }
      if (outcome.outcome === "timeout") {
        return {
          success: false,
          error: {
            kind: "timeout",
            message: `Task "${key}" timed out.`,
            issues: [],
            step: key,
          },
        };
      }
      if (outcome.outcome === "failed") {
        return {
          success: false,
          error: {
            kind: "failed",
            message: outcome.message,
            issues: [],
            step: key,
          },
        };
      }
      if (outcome.outcome === "invalid") {
        return {
          success: false,
          error: {
            kind: "validation",
            message: outcome.issues[0]?.message ?? "Invalid task result.",
            issues: outcome.issues,
            step: key,
          },
        };
      }
      answers[key] = outcome.value;
    }

    return { success: true, data: answers };
  }

  async function ask<TOut = InferAll<TQuestions, TTasks>>(
    options?: AskOptions<InferAnswers<TQuestions>>,
    overrideAnswersSchema?: z.ZodType<TOut, any>,
  ): Promise<AskResult<TOut>> {
    const renderer = options?.renderer ?? (await defaultRenderer());
    const collected = await askAll(
      renderer,
      options?.prefilled as Record<string, unknown> | undefined,
    );
    if (!collected.success) return collected as AskResult<TOut>;

    // Each answer already passed its own schema during collection - a when()-skipped
    // question is legitimately absent from collected.data, so only re-validate the
    // whole object when the caller supplied an override (cross-field) schema.
    if (!overrideAnswersSchema) {
      return { success: true, data: collected.data as TOut };
    }

    const finalResult = overrideAnswersSchema.safeParse(collected.data);
    if (!finalResult.success) {
      const issues = toQuestionsIssues(finalResult.error);
      return {
        success: false,
        error: {
          kind: "validation",
          message: issues.map((issue) => issue.message).join("\n"),
          issues,
        },
      };
    }
    return { success: true, data: finalResult.data };
  }

  async function askOrExit<TOut = InferAll<TQuestions, TTasks>>(
    options?: AskOptions<InferAnswers<TQuestions>>,
    overrideAnswersSchema?: z.ZodType<TOut, any>,
  ): Promise<TOut> {
    const result = await ask(options, overrideAnswersSchema);
    if (!result.success) {
      console.error(result.error.message);
      process.exit(1);
    }
    return result.data;
  }

  return { answersSchema, ask, askOrExit };
}
