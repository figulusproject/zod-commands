import type { z } from "zod";

export interface QuestionDescriptor<T = unknown> {
  schema: z.ZodType<T, any>;
  message: string;
  /** Skips this question when it returns false, seeing only answers collected so far. */
  when?: (answers: any) => boolean;
  /** Ghost text shown in a text/password widget. */
  placeholder?: string;
  /** Pre-filled/pre-selected value shown before the user answers. */
  initialValue?: unknown;
  /** Renders as a masked text widget for a sensitive value. */
  secret?: boolean;
  /** Required for an array-shaped schema. A bare array schema throws without it. */
  multiselect?: boolean;
  /** Overrides the displayed text per choice for a select/multiselect widget. */
  labels?: Record<string, string>;
}

export type QuestionDescriptors = Record<string, QuestionDescriptor<any>>;

export interface TaskDescriptor<T = unknown> {
  message: string;
  /** Skips this task when it returns false, seeing every answer and task result so far. */
  when?: (answers: any) => boolean;
  /** Enforced by the engine via a race against `run()`, not by `run()` itself. */
  timeoutMs?: number;
  /** Validates and types the result. Omit for a pure side effect - the stored result is `undefined`. */
  schema?: z.ZodType<T, any>;
  run: (ctx: {
    update: (msg: string) => void;
    signal: AbortSignal;
  }) => Promise<unknown>;
}

export type TaskDescriptors = Record<string, TaskDescriptor<any>>;

export type QuestionsErrorKind =
  "validation" | "cancelled" | "timeout" | "failed";

export interface QuestionsIssue {
  path: (string | number)[];
  message: string;
}

export interface QuestionsError {
  kind: QuestionsErrorKind;
  message: string;
  issues: QuestionsIssue[];
  /** Which question or task was in flight when this happened. */
  step?: string;
}

export type AskResult<TData> =
  { success: true; data: TData } | { success: false; error: QuestionsError };
