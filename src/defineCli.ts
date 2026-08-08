import type { ParseArgsOptionDescriptor } from "node:util";
import { parseArgs } from "node:util";
import { z } from "zod";
import { isBooleanSchema, isOptionalFlag } from "./introspect.js";
import { kebabCase } from "./formatting.js";
import type {
  CliIssue,
  FlagDescriptor,
  FlagDescriptors,
  FlagRawValue,
  ParseResult,
} from "./types.js";
import { buildUsage } from "./usage.js";

interface ResolvedFlag {
  key: string;
  long: string;
  descriptor: FlagDescriptor;
  isBoolean: boolean;
}

function resolveFlags(flags: FlagDescriptors): ResolvedFlag[] {
  return Object.entries(flags).map(([key, descriptor]) => {
    const long = descriptor.long ?? kebabCase(key);
    const isBoolean = isBooleanSchema(descriptor.schema);
    if (descriptor.negatable && !isBoolean) {
      throw new Error(
        `zod-cli-flags: flag "${key}" has negatable:true but its schema isn't a z.boolean() (or wrapped z.boolean()). Negation only applies to presence-based boolean flags; use z.stringbool() for a value-taking boolean instead.`,
      );
    }
    return { key, long, descriptor, isBoolean };
  });
}

function buildParseArgsOptions(
  resolved: ResolvedFlag[],
): Record<string, ParseArgsOptionDescriptor> {
  const options: Record<string, ParseArgsOptionDescriptor> = {};
  for (const { long, descriptor, isBoolean } of resolved) {
    const option: ParseArgsOptionDescriptor = {
      type: isBoolean ? "boolean" : "string",
    };
    if (descriptor.short) option.short = descriptor.short;
    if (descriptor.multiple) option.multiple = true;
    options[long] = option;
    if (descriptor.negatable) {
      options[`no-${long}`] = { type: "boolean" };
    }
  }
  return options;
}

function buildRawFlags(
  resolved: ResolvedFlag[],
  values: Record<string, FlagRawValue>,
): { raw: Record<string, unknown>; argvErrors: string[] } {
  const raw: Record<string, unknown> = {};
  const argvErrors: string[] = [];
  for (const { key, long, descriptor } of resolved) {
    if (descriptor.negatable) {
      const pos = values[long];
      const neg = values[`no-${long}`];
      if (pos === true && neg === true) {
        argvErrors.push(`Cannot pass both --${long} and --no-${long}.`);
        continue;
      }
      raw[key] = pos === true ? true : neg === true ? false : undefined;
    } else {
      raw[key] = values[long];
    }
  }
  return { raw, argvErrors };
}
// Strips the Node binary and script path so they aren't misparsed as positionals.
function normalizeArgv(argv: string[]): string[] {
  const looksLikeUnslicedProcessArgv =
    argv.length >= 2 &&
    argv[0] === process.argv[0] &&
    argv[1] === process.argv[1];
  return looksLikeUnslicedProcessArgv ? argv.slice(2) : argv;
}

function toCliIssues(error: z.ZodError): CliIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path as (string | number)[],
    message: issue.message,
  }));
}

export interface DefineCliOptions<
  TFlags extends FlagDescriptors,
  TPositionalsSchema extends z.ZodType | undefined,
> {
  flags: TFlags;
  positionals?: TPositionalsSchema;
  usage?: string;
}

type InferFlags<TFlags extends FlagDescriptors> = {
  [K in keyof TFlags]: z.infer<TFlags[K]["schema"]>;
};
type InferPositionals<TPositionalsSchema> = TPositionalsSchema extends z.ZodType
  ? z.infer<TPositionalsSchema>
  : string[];

export interface CliDefinition<
  TFlags extends FlagDescriptors,
  TPositionalsSchema extends z.ZodType | undefined,
> {
  flagsSchema: z.ZodObject<{ [K in keyof TFlags]: TFlags[K]["schema"] }>;
  parseArgsOptions: Record<string, ParseArgsOptionDescriptor>;
  usage: string;
  parse<TOut = InferFlags<TFlags>>(
    argv: string[],
    overrideFlagsSchema?: z.ZodType<TOut, any>,
  ): ParseResult<TOut, InferPositionals<TPositionalsSchema>>;
  parseOrExit<TOut = InferFlags<TFlags>>(
    argv: string[],
    overrideFlagsSchema?: z.ZodType<TOut, any>,
  ): { data: TOut; positionals: InferPositionals<TPositionalsSchema> };
}

export function defineCli<
  TFlags extends FlagDescriptors,
  TPositionalsSchema extends z.ZodType | undefined = undefined,
>(
  def: DefineCliOptions<TFlags, TPositionalsSchema>,
): CliDefinition<TFlags, TPositionalsSchema> {
  const resolved = resolveFlags(def.flags);
  const parseArgsOptions = buildParseArgsOptions(resolved);

  const shape = Object.fromEntries(
    resolved.map(({ key, descriptor }) => [key, descriptor.schema]),
  ) as {
    [K in keyof TFlags]: TFlags[K]["schema"];
  };
  const flagsSchema = z.object(shape);

  const usage =
    def.usage ??
    buildUsage(
      resolved.map(({ long, descriptor, isBoolean }) => ({
        long,
        descriptor,
        isBoolean,
        isOptional: isOptionalFlag(descriptor.schema),
      })),
    );

  function parse<TOut = InferFlags<TFlags>>(
    argv: string[],
    overrideFlagsSchema?: z.ZodType<TOut, any>,
  ): ParseResult<TOut, InferPositionals<TPositionalsSchema>> {
    let values: Record<string, FlagRawValue>;
    let positionalsRaw: string[];
    try {
      const parsed = parseArgs({
        args: normalizeArgv(argv),
        options: parseArgsOptions,
        allowPositionals: def.positionals !== undefined,
        strict: true,
      });
      values = parsed.values as Record<string, FlagRawValue>;
      positionalsRaw = (parsed.positionals ?? []) as string[];
    } catch (error) {
      return {
        success: false,
        error: {
          message: error instanceof Error ? error.message : String(error),
          issues: [],
        },
      };
    }

    const { raw, argvErrors } = buildRawFlags(resolved, values);
    if (argvErrors.length > 0) {
      return {
        success: false,
        error: { message: argvErrors.join("\n"), issues: [] },
      };
    }

    const schemaToUse = (overrideFlagsSchema ?? flagsSchema) as z.ZodType<
      TOut,
      any
    >;
    const flagsResult = schemaToUse.safeParse(raw);
    const positionalsResult = def.positionals
      ? def.positionals.safeParse(positionalsRaw)
      : { success: true as const, data: positionalsRaw };

    if (!flagsResult.success || !positionalsResult.success) {
      const issues = [
        ...(flagsResult.success ? [] : toCliIssues(flagsResult.error)),
        ...(positionalsResult.success
          ? []
          : toCliIssues(positionalsResult.error)),
      ];
      return {
        success: false,
        error: {
          message: issues.map((issue) => issue.message).join("\n"),
          issues,
        },
      };
    }

    return {
      success: true,
      data: flagsResult.data,
      positionals:
        positionalsResult.data as InferPositionals<TPositionalsSchema>,
    };
  }

  function parseOrExit<TOut = InferFlags<TFlags>>(
    argv: string[],
    overrideFlagsSchema?: z.ZodType<TOut, any>,
  ): { data: TOut; positionals: InferPositionals<TPositionalsSchema> } {
    const result = parse(argv, overrideFlagsSchema);
    if (!result.success) {
      console.error(result.error.message);
      console.error(usage);
      process.exit(1);
    }
    return { data: result.data, positionals: result.positionals };
  }

  return { flagsSchema, parseArgsOptions, usage, parse, parseOrExit };
}
