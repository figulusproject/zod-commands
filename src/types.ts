import type { z } from "zod";

export type FlagRawValue = string | boolean | string[] | undefined;

export interface FlagDescriptor<T = unknown> {
  schema: z.ZodType<T, any>;
  /** Defaults to kebab-case(property key). */
  long?: string;
  /** Single-character alias. */
  short?: string;
  /** Repeatable flag; raw value collected into a string[]. */
  multiple?: boolean;
  /** Boolean-only: also registers --no-<long>, resolved to true | false | undefined before the schema runs. */
  negatable?: boolean;
  /** Shown in the auto-generated usage string. */
  description?: string;
}

export type FlagDescriptors = Record<string, FlagDescriptor<any>>;

export interface CliIssue {
  path: (string | number)[];
  message: string;
}

export interface CliParseError {
  message: string;
  issues: CliIssue[];
}

export type ParseResult<TFlags, TPositionals> =
  | { success: true; data: TFlags; positionals: TPositionals }
  | { success: false; error: CliParseError };
