import { parseArgs } from "node:util";
import { z } from "zod";
import type {
  CliDefinition,
  InferFlags,
  InferPositionals,
} from "./defineCli.js";
import {
  buildParseArgsOptions,
  buildRawFlags,
  checkExclusiveGroups,
  normalizeArgv,
  resolveFlags,
  toCliIssues,
  validateExclusiveGroups,
} from "./defineCli.js";
import { isOptionalFlag } from "./introspect.js";
import type {
  CliParseError,
  ExclusiveGroup,
  FlagDescriptors,
  FlagRawValue,
} from "./types.js";
import { buildUsage } from "./usage.js";

export type SubCommand = CliDefinition<any, any> | CommandsDefinition<any>;

export type CommandDescriptors = Record<string, SubCommand>;

type ChildSuccess<TSub> =
  TSub extends CliDefinition<infer TF, infer TP>
    ? { success: true; data: InferFlags<TF>; positionals: InferPositionals<TP> }
    : TSub extends CommandsDefinition<infer TR>
      ? Extract<TR, { success: true }>
      : never;

// Prepends this level's command name/global flags to whatever the resolved child already carries,
// so a command tree of any depth surfaces a single flat `command` path and merged `global` object.
type WithCommandAndGlobal<
  K extends string,
  TFlags extends FlagDescriptors,
  S,
> = S extends { command: infer C extends readonly string[]; global: infer G }
  ? Omit<S, "command" | "global"> & {
      command: [K, ...C];
      global: InferFlags<TFlags> & G;
    }
  : S & { command: [K]; global: InferFlags<TFlags> };

type CommandsSuccessResult<
  TFlags extends FlagDescriptors,
  TCommands extends CommandDescriptors,
> = {
  [K in keyof TCommands & string]: WithCommandAndGlobal<
    K,
    TFlags,
    ChildSuccess<TCommands[K]>
  >;
}[keyof TCommands & string];

export type CommandsParseResult<
  TFlags extends FlagDescriptors,
  TCommands extends CommandDescriptors,
> =
  | CommandsSuccessResult<TFlags, TCommands>
  | { success: false; command?: string[]; error: CliParseError };

export interface CommandsDefinition<
  TResult,
  TCommands extends CommandDescriptors = CommandDescriptors,
> {
  usage: string;
  commands: TCommands;
  parse(argv: string[]): TResult;
  parseOrExit(argv: string[]): Extract<TResult, { success: true }>;
}

export interface DefineCommandsOptions<
  TFlags extends FlagDescriptors,
  TCommands extends CommandDescriptors,
> {
  commands: TCommands;
  /** Global flags, parsed before the command name (e.g. `mycli --verbose init`). */
  flags?: TFlags;
  exclusiveGroups?: ExclusiveGroup<TFlags>[];
  usage?: string;
}

function buildCommandsUsage(
  names: string[],
  resolved: ReturnType<typeof resolveFlags>,
  exclusiveGroups: ExclusiveGroup[],
): string {
  const flagsUsage = buildUsage(
    resolved.map(({ key, long, descriptor, isBoolean }) => ({
      key,
      long,
      descriptor,
      isBoolean,
      isOptional: isOptionalFlag(descriptor.schema),
    })),
    undefined,
    exclusiveGroups.map((group) => ({
      keys: group.flags as string[],
      required: group.required ?? false,
    })),
  ).replace(/^Usage:\s*/, "");

  const commandsPart = `(${names.join("|")}) ...`;
  return flagsUsage
    ? `Usage: ${flagsUsage} ${commandsPart}`
    : `Usage: ${commandsPart}`;
}

export function defineCommands<
  TCommands extends CommandDescriptors,
  TFlags extends FlagDescriptors = {},
>(
  def: DefineCommandsOptions<TFlags, TCommands>,
): CommandsDefinition<CommandsParseResult<TFlags, TCommands>, TCommands> {
  const names = Object.keys(def.commands);
  if (names.length === 0) {
    throw new Error(
      "zod-cli-flags: defineCommands() requires at least 1 command.",
    );
  }

  const flags = (def.flags ?? {}) as TFlags;
  const resolved = resolveFlags(flags);
  const parseArgsOptions = buildParseArgsOptions(resolved);
  const exclusiveGroups = (def.exclusiveGroups ?? []) as ExclusiveGroup[];
  validateExclusiveGroups(exclusiveGroups, flags);
  const longOf = new Map(resolved.map(({ key, long }) => [key, long]));

  const shape = Object.fromEntries(
    resolved.map(({ key, descriptor }) => [key, descriptor.schema]),
  ) as { [K in keyof TFlags]: TFlags[K]["schema"] };
  const flagsSchema = z.object(shape);

  const usage =
    def.usage ?? buildCommandsUsage(names, resolved, exclusiveGroups);

  // Splits argv into the leading global-flags segment and the trailing command segment
  // (subcommand name plus everything after it), using node:util's non-strict token stream
  // so unrecognized flags/positionals don't throw - they just mark the split point.
  function splitArgv(rawArgv: string[]): {
    globalSegment: string[];
    commandSegment: string[];
  } {
    const argv = normalizeArgv(rawArgv);
    if (resolved.length === 0) {
      return { globalSegment: [], commandSegment: argv };
    }

    const { tokens } = parseArgs({
      args: argv,
      options: parseArgsOptions,
      strict: false,
      tokens: true,
      allowPositionals: true,
    });

    let boundary = argv.length;
    let globalEnd = argv.length;
    for (const token of tokens) {
      if (token.kind === "positional") {
        boundary = token.index;
        globalEnd = token.index;
        break;
      }
      if (token.kind === "option-terminator") {
        boundary = token.index + 1;
        globalEnd = token.index;
        break;
      }
      if (!(token.name in parseArgsOptions)) {
        boundary = token.index;
        globalEnd = token.index;
        break;
      }
    }

    return {
      globalSegment: argv.slice(0, globalEnd),
      commandSegment: argv.slice(boundary),
    };
  }

  function parseGlobalFlags(
    globalSegment: string[],
  ):
    | { success: true; data: InferFlags<TFlags> }
    | { success: false; error: CliParseError } {
    let values: Record<string, FlagRawValue>;
    try {
      const parsed = parseArgs({
        args: globalSegment,
        options: parseArgsOptions,
        strict: true,
        allowPositionals: false,
      });
      values = parsed.values as Record<string, FlagRawValue>;
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

    const result = flagsSchema.safeParse(raw);
    if (!result.success) {
      const issues = toCliIssues(result.error);
      return {
        success: false,
        error: {
          message: issues.map((issue) => issue.message).join("\n"),
          issues,
        },
      };
    }

    return { success: true, data: result.data as InferFlags<TFlags> };
  }

  function resolveCommand(
    commandSegment: string[],
  ):
    | { ok: true; name: string; child: SubCommand; rest: string[] }
    | { ok: false; error: CliParseError } {
    const [name, ...rest] = commandSegment;
    if (name === undefined) {
      return {
        ok: false,
        error: {
          message: `A command is required. Valid commands: ${names.join(", ")}.`,
          issues: [],
        },
      };
    }
    if (name.startsWith("-")) {
      return {
        ok: false,
        error: {
          message: `Unknown flag "${name}". A command is required. Valid commands: ${names.join(", ")}.`,
          issues: [],
        },
      };
    }
    const child = def.commands[name];
    if (!child) {
      return {
        ok: false,
        error: {
          message: `Unknown command "${name}". Valid commands: ${names.join(", ")}.`,
          issues: [],
        },
      };
    }
    return { ok: true, name, child, rest };
  }

  function wrapSuccess(
    name: string,
    globalData: InferFlags<TFlags>,
    childResult: {
      data: unknown;
      positionals: unknown;
      command?: string[];
      global?: Record<string, unknown>;
    },
  ) {
    return {
      success: true as const,
      command: childResult.command ? [name, ...childResult.command] : [name],
      global: { ...globalData, ...(childResult.global ?? {}) },
      data: childResult.data,
      positionals: childResult.positionals,
    };
  }

  function parse(argv: string[]): CommandsParseResult<TFlags, TCommands> {
    const { globalSegment, commandSegment } = splitArgv(argv);
    const globalResult = parseGlobalFlags(globalSegment);
    if (!globalResult.success) {
      return {
        success: false,
        error: globalResult.error,
      } as CommandsParseResult<TFlags, TCommands>;
    }

    const resolvedCommand = resolveCommand(commandSegment);
    if (!resolvedCommand.ok) {
      return {
        success: false,
        error: resolvedCommand.error,
      } as CommandsParseResult<TFlags, TCommands>;
    }

    const { name, child, rest } = resolvedCommand;
    const childResult = child.parse(rest) as {
      success: boolean;
      data?: unknown;
      positionals?: unknown;
      command?: string[];
      global?: Record<string, unknown>;
      error?: CliParseError;
    };
    if (!childResult.success) {
      return {
        success: false,
        command: childResult.command ? [name, ...childResult.command] : [name],
        error: childResult.error!,
      } as CommandsParseResult<TFlags, TCommands>;
    }

    return wrapSuccess(
      name,
      globalResult.data,
      childResult as {
        data: unknown;
        positionals: unknown;
        command?: string[];
        global?: Record<string, unknown>;
      },
    ) as CommandsParseResult<TFlags, TCommands>;
  }

  function parseOrExit(
    argv: string[],
  ): Extract<CommandsParseResult<TFlags, TCommands>, { success: true }> {
    const { globalSegment, commandSegment } = splitArgv(argv);
    const globalResult = parseGlobalFlags(globalSegment);
    if (!globalResult.success) {
      console.error(globalResult.error.message);
      console.error(usage);
      process.exit(1);
    }

    const resolvedCommand = resolveCommand(commandSegment);
    if (!resolvedCommand.ok) {
      console.error(resolvedCommand.error.message);
      console.error(usage);
      process.exit(1);
    }

    const { name, child, rest } = resolvedCommand;
    const childResult = child.parseOrExit(rest) as {
      data: unknown;
      positionals: unknown;
      command?: string[];
      global?: Record<string, unknown>;
    };

    return wrapSuccess(name, globalResult.data, childResult) as Extract<
      CommandsParseResult<TFlags, TCommands>,
      { success: true }
    >;
  }

  return { usage, commands: def.commands, parse, parseOrExit };
}
