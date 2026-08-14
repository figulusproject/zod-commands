import type { ParseArgsOptionDescriptor } from "node:util";
import { parseArgs } from "node:util";
import { z } from "zod";
import { isBooleanSchema, isOptionalFlag } from "./introspect.js";
import { joinWithConjunction, kebabCase } from "./formatting.js";
import type {
  CliIssue,
  ExclusiveGroup,
  FlagDescriptor,
  FlagDescriptors,
  FlagRawValue,
  ParseResult,
  PositionalsDescriptor,
} from "./types.js";
import { buildUsage } from "./usage.js";

export interface ResolvedFlag {
  key: string;
  long: string;
  descriptor: FlagDescriptor;
  isBoolean: boolean;
}

export function resolveFlags(flags: FlagDescriptors): ResolvedFlag[] {
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

export function buildParseArgsOptions(
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

export function validateExclusiveGroups(
  groups: ExclusiveGroup[],
  flags: FlagDescriptors,
): void {
  const seen = new Set<string>();
  for (const group of groups) {
    if (group.flags.length < 2) {
      throw new Error(
        `zod-cli-flags: exclusiveGroups group must reference at least 2 flags, got: [${group.flags.join(", ")}].`,
      );
    }
    for (const key of group.flags) {
      const flagKey = key as string;
      if (!(flagKey in flags)) {
        throw new Error(
          `zod-cli-flags: exclusiveGroups references unknown flag "${flagKey}".`,
        );
      }
      if (seen.has(flagKey)) {
        throw new Error(
          `zod-cli-flags: flag "${flagKey}" cannot appear in more than one exclusiveGroups group.`,
        );
      }
      seen.add(flagKey);
      if (!isOptionalFlag(flags[flagKey]!.schema)) {
        throw new Error(
          `zod-cli-flags: flag "${flagKey}" in an exclusiveGroups group must be .optional()/.default(), since the group requires other members to be omitted.`,
        );
      }
    }
  }
}

export function checkExclusiveGroups(
  groups: ExclusiveGroup[],
  raw: Record<string, unknown>,
  longOf: Map<string, string>,
): string[] {
  const errors: string[] = [];
  for (const group of groups) {
    const keys = group.flags as string[];
    const present = keys.filter((key) => raw[key] !== undefined);
    const longsOf = (list: string[]) =>
      list.map((key) => `--${longOf.get(key)}`);
    if (present.length > 1) {
      errors.push(
        `${joinWithConjunction(longsOf(present), "and")} are mutually exclusive.`,
      );
    } else if (group.required && present.length === 0) {
      errors.push(
        `One of ${joinWithConjunction(longsOf(keys), "or")} is required.`,
      );
    }
  }
  return errors;
}

export function buildRawFlags(
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
export function normalizeArgv(argv: string[]): string[] {
  const looksLikeUnslicedProcessArgv =
    argv.length >= 2 &&
    argv[0] === process.argv[0] &&
    argv[1] === process.argv[1];
  return looksLikeUnslicedProcessArgv ? argv.slice(2) : argv;
}

export function toCliIssues(error: z.ZodError): CliIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path as (string | number)[],
    message: issue.message,
  }));
}

type PositionalsInput = z.ZodType | PositionalsDescriptor;

type SchemaOf<TPositionalsInput> =
  TPositionalsInput extends PositionalsDescriptor<infer T>
    ? z.ZodType<T, any>
    : TPositionalsInput extends z.ZodType
      ? TPositionalsInput
      : undefined;

function resolvePositionals(positionals: PositionalsInput | undefined): {
  schema?: z.ZodType;
  label?: string;
} {
  if (positionals === undefined) return {};
  if (positionals instanceof z.ZodType) return { schema: positionals };
  return { schema: positionals.schema, label: positionals.label };
}

export interface DefineCliOptions<
  TFlags extends FlagDescriptors,
  TPositionalsInput extends PositionalsInput | undefined,
> {
  flags: TFlags;
  positionals?: TPositionalsInput;
  exclusiveGroups?: ExclusiveGroup<TFlags>[];
  usage?: string;
}

export type InferFlags<TFlags extends FlagDescriptors> = {
  [K in keyof TFlags]: z.infer<TFlags[K]["schema"]>;
};
export type InferPositionals<TPositionalsInput> =
  SchemaOf<TPositionalsInput> extends z.ZodType
    ? z.infer<SchemaOf<TPositionalsInput>>
    : string[];

export interface CliDefinition<
  TFlags extends FlagDescriptors,
  TPositionalsInput extends PositionalsInput | undefined,
> {
  flagsSchema: z.ZodObject<{ [K in keyof TFlags]: TFlags[K]["schema"] }>;
  parseArgsOptions: Record<string, ParseArgsOptionDescriptor>;
  usage: string;
  parse<TOut = InferFlags<TFlags>>(
    argv: string[],
    overrideFlagsSchema?: z.ZodType<TOut, any>,
  ): ParseResult<TOut, InferPositionals<TPositionalsInput>>;
  parseOrExit<TOut = InferFlags<TFlags>>(
    argv: string[],
    overrideFlagsSchema?: z.ZodType<TOut, any>,
  ): { data: TOut; positionals: InferPositionals<TPositionalsInput> };
}

export function defineCli<
  TFlags extends FlagDescriptors,
  TPositionalsInput extends PositionalsInput | undefined = undefined,
>(
  def: DefineCliOptions<TFlags, TPositionalsInput>,
): CliDefinition<TFlags, TPositionalsInput> {
  const resolved = resolveFlags(def.flags);
  const parseArgsOptions = buildParseArgsOptions(resolved);
  const positionalsConfig = resolvePositionals(def.positionals);
  const exclusiveGroups = (def.exclusiveGroups ?? []) as ExclusiveGroup[];
  validateExclusiveGroups(exclusiveGroups, def.flags);
  const longOf = new Map(resolved.map(({ key, long }) => [key, long]));

  const shape = Object.fromEntries(
    resolved.map(({ key, descriptor }) => [key, descriptor.schema]),
  ) as {
    [K in keyof TFlags]: TFlags[K]["schema"];
  };
  const flagsSchema = z.object(shape);

  const usage =
    def.usage ??
    buildUsage(
      resolved.map(({ key, long, descriptor, isBoolean }) => ({
        key,
        long,
        descriptor,
        isBoolean,
        isOptional: isOptionalFlag(descriptor.schema),
      })),
      positionalsConfig.label,
      exclusiveGroups.map((group) => ({
        keys: group.flags as string[],
        required: group.required ?? false,
      })),
    );

  function parse<TOut = InferFlags<TFlags>>(
    argv: string[],
    overrideFlagsSchema?: z.ZodType<TOut, any>,
  ): ParseResult<TOut, InferPositionals<TPositionalsInput>> {
    let values: Record<string, FlagRawValue>;
    let positionalsRaw: string[];
    try {
      const parsed = parseArgs({
        args: normalizeArgv(argv),
        options: parseArgsOptions,
        allowPositionals: positionalsConfig.schema !== undefined,
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
    argvErrors.push(...checkExclusiveGroups(exclusiveGroups, raw, longOf));
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
    const positionalsResult = positionalsConfig.schema
      ? positionalsConfig.schema.safeParse(positionalsRaw)
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
        positionalsResult.data as InferPositionals<TPositionalsInput>,
    };
  }

  function parseOrExit<TOut = InferFlags<TFlags>>(
    argv: string[],
    overrideFlagsSchema?: z.ZodType<TOut, any>,
  ): { data: TOut; positionals: InferPositionals<TPositionalsInput> } {
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
