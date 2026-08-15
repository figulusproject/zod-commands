import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { defineCli } from "./defineCli.js";
import { defineCommands } from "./commands.js";

describe("defineCommands - basic dispatch", () => {
  const cli = defineCommands({
    commands: {
      init: defineCli({
        flags: { template: { schema: z.string().optional() } },
      }),
      build: defineCli({
        flags: { watch: { schema: z.boolean().default(false) } },
        positionals: z.array(z.string()),
      }),
    },
  });

  it("dispatches to the matching subcommand", () => {
    const result = cli.parse(["init", "--template", "foo"]);
    expect(result).toEqual({
      success: true,
      command: ["init"],
      global: {},
      data: { template: "foo" },
      positionals: [],
    });
  });

  it("threads flags and positionals through to the resolved subcommand", () => {
    const result = cli.parse(["build", "--watch", "a", "b"]);
    expect(result).toEqual({
      success: true,
      command: ["build"],
      global: {},
      data: { watch: true },
      positionals: ["a", "b"],
    });
  });

  it("fails with success:false for an unknown command", () => {
    const result = cli.parse(["bogus"]);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toMatch(/Unknown command "bogus"/);
      expect(result.error.message).toMatch(/init, build/);
    }
  });

  it("fails with success:false when no command is given", () => {
    const result = cli.parse([]);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toMatch(/A command is required/);
    }
  });

  it("surfaces the resolved subcommand's own parse error with a command path", () => {
    const result = cli.parse(["init", "--bogus"]);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.command).toEqual(["init"]);
      expect(result.error.issues).toEqual([]);
    }
  });

  it("throws at defineCommands() time with no commands", () => {
    expect(() => defineCommands({ commands: {} })).toThrow(
      /at least 1 command/,
    );
  });
});

describe("defineCommands - nested command trees", () => {
  const cli = defineCommands({
    commands: {
      remote: defineCommands({
        commands: {
          add: defineCli({ flags: { url: { schema: z.string() } } }),
          remove: defineCli({ flags: { name: { schema: z.string() } } }),
        },
      }),
      status: defineCli({ flags: {} }),
    },
  });

  it("builds a full command path across nested levels", () => {
    const result = cli.parse(["remote", "add", "--url", "http://example"]);
    expect(result).toEqual({
      success: true,
      command: ["remote", "add"],
      global: {},
      data: { url: "http://example" },
      positionals: [],
    });
  });

  it("resolves a leaf at the top level alongside a nested branch", () => {
    const result = cli.parse(["status"]);
    expect(result).toEqual({
      success: true,
      command: ["status"],
      global: {},
      data: {},
      positionals: [],
    });
  });

  it("reports an unknown nested command with the outer command already resolved", () => {
    const result = cli.parse(["remote", "bogus"]);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.command).toEqual(["remote"]);
      expect(result.error.message).toMatch(/Unknown command "bogus"/);
      expect(result.error.message).toMatch(/add, remove/);
    }
  });
});

describe("defineCommands - global flags", () => {
  const cli = defineCommands({
    flags: { verbose: { schema: z.boolean().default(false), short: "v" } },
    commands: {
      init: defineCli({
        flags: { template: { schema: z.string().optional() } },
      }),
    },
  });

  it("parses global flags declared before the command name", () => {
    const result = cli.parse(["--verbose", "init", "--template", "foo"]);
    expect(result).toEqual({
      success: true,
      command: ["init"],
      global: { verbose: true },
      data: { template: "foo" },
      positionals: [],
    });
  });

  it("supports the short alias for a global flag", () => {
    const result = cli.parse(["-v", "init"]);
    expect(result.success).toBe(true);
    if (result.success) expect(result.global).toEqual({ verbose: true });
  });

  it("falls back to the global flag's default when omitted", () => {
    const result = cli.parse(["init"]);
    expect(result.success).toBe(true);
    if (result.success) expect(result.global).toEqual({ verbose: false });
  });

  it("doesn't let a subcommand-specific flag placed before the command name be mistaken for the command", () => {
    const result = cli.parse(["--template", "foo", "init"]);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toMatch(/Unknown flag "--template"/);
    }
  });

  it("merges global flags from nested levels, inner taking precedence on key collisions", () => {
    const nested = defineCommands({
      flags: { verbose: { schema: z.boolean().default(false), short: "v" } },
      commands: {
        remote: defineCommands({
          flags: { dryRun: { schema: z.boolean().default(false) } },
          commands: {
            add: defineCli({ flags: { url: { schema: z.string() } } }),
          },
        }),
      },
    });

    const result = nested.parse([
      "--verbose",
      "remote",
      "--dry-run",
      "add",
      "--url",
      "http://example",
    ]);
    expect(result).toEqual({
      success: true,
      command: ["remote", "add"],
      global: { verbose: true, dryRun: true },
      data: { url: "http://example" },
      positionals: [],
    });
  });

  it("rejects an invalid global flag value before ever resolving the command", () => {
    const numericCli = defineCommands({
      flags: { retries: { schema: z.coerce.number().int() } },
      commands: { init: defineCli({ flags: {} }) },
    });
    const result = numericCli.parse(["--retries", "abc", "init"]);
    expect(result.success).toBe(false);
  });

  it("renders global flags in the auto-generated usage before the command list", () => {
    expect(cli.usage).toBe("Usage: [--verbose/-v] (init) ...");
  });

  it("supports exclusiveGroups among global flags", () => {
    const groupCli = defineCommands({
      flags: {
        json: { schema: z.boolean().optional() },
        yaml: { schema: z.boolean().optional() },
      },
      exclusiveGroups: [{ flags: ["json", "yaml"] }],
      commands: { run: defineCli({ flags: {} }) },
    });

    const both = groupCli.parse(["--json", "--yaml", "run"]);
    expect(both.success).toBe(false);
    if (!both.success) {
      expect(both.error.message).toMatch(/mutually exclusive/);
    }

    const one = groupCli.parse(["--json", "run"]);
    expect(one.success).toBe(true);
  });
});

describe("defineCommands - argv normalization", () => {
  const cli = defineCommands({
    commands: { init: defineCli({ flags: {} }) },
  });

  it("auto-trims when given raw, unsliced process.argv", () => {
    const rawArgv = [process.argv[0]!, process.argv[1]!, "init"];
    const result = cli.parse(rawArgv);
    expect(result.success).toBe(true);
    if (result.success) expect(result.command).toEqual(["init"]);
  });
});

describe("defineCommands - parseOrExit", () => {
  const cli = defineCommands({
    commands: { init: defineCli({ flags: {} }) },
  });
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    exitSpy = vi.spyOn(process, "exit").mockImplementation(((): never => {
      throw new Error("process.exit called");
    }) as never);
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    exitSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("returns the resolved command result directly on success", () => {
    const result = cli.parseOrExit(["init"]);
    expect(result).toEqual({
      success: true,
      command: ["init"],
      global: {},
      data: {},
      positionals: [],
    });
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("prints the error message and usage, then exits 1, for an unknown command", () => {
    expect(() => cli.parseOrExit(["bogus"])).toThrow("process.exit called");
    expect(errorSpy).toHaveBeenCalledTimes(2);
    expect(errorSpy.mock.calls[1]?.[0]).toBe(cli.usage);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("delegates to the resolved subcommand's own parseOrExit on a nested failure", () => {
    const withFlags = defineCommands({
      commands: {
        init: defineCli({ flags: { template: { schema: z.string() } } }),
      },
    });
    expect(() => withFlags.parseOrExit(["init"])).toThrow(
      "process.exit called",
    );
    expect(errorSpy.mock.calls[1]?.[0]).toBe(withFlags.commands.init.usage);
  });
});

describe("defineCommands - defaultCommand", () => {
  const cli = defineCommands({
    flags: { verbose: { schema: z.boolean().default(false) } },
    defaultCommand: "crawl",
    commands: {
      crawl: defineCli({
        flags: { depth: { schema: z.coerce.number().default(1) } },
        positionals: z.array(z.string()),
      }),
      status: defineCli({ flags: {} }),
    },
  });

  it("dispatches to the default command when the first token is a positional", () => {
    const result = cli.parse(["https://example.com"]);
    expect(result).toEqual({
      success: true,
      command: ["crawl"],
      global: { verbose: false },
      data: { depth: 1 },
      positionals: ["https://example.com"],
    });
  });

  it("dispatches to the default command when the first token is a flag it owns", () => {
    const result = cli.parse(["--depth", "3", "https://example.com"]);
    expect(result).toEqual({
      success: true,
      command: ["crawl"],
      global: { verbose: false },
      data: { depth: 3 },
      positionals: ["https://example.com"],
    });
  });

  it("dispatches to the default command with no args at all", () => {
    const result = cli.parse([]);
    expect(result).toEqual({
      success: true,
      command: ["crawl"],
      global: { verbose: false },
      data: { depth: 1 },
      positionals: [],
    });
  });

  it("still resolves an explicitly named command over the default", () => {
    const result = cli.parse(["status"]);
    expect(result).toEqual({
      success: true,
      command: ["status"],
      global: { verbose: false },
      data: {},
      positionals: [],
    });
  });

  it("parses global flags before falling back to the default command", () => {
    const result = cli.parse(["--verbose", "https://example.com"]);
    expect(result).toEqual({
      success: true,
      command: ["crawl"],
      global: { verbose: true },
      data: { depth: 1 },
      positionals: ["https://example.com"],
    });
  });

  it("uses brackets instead of parens in the auto-generated usage", () => {
    expect(cli.usage).toContain("[crawl|status] ...");
  });

  it("throws at defineCommands() time when defaultCommand isn't a defined command", () => {
    expect(() =>
      defineCommands({
        defaultCommand: "bogus" as any,
        commands: { init: defineCli({ flags: {} }) },
      }),
    ).toThrow(/defaultCommand "bogus" is not one of the defined commands/);
  });
});

describe("defineCommands - per-command override schema", () => {
  const rangeCli = defineCli({
    flags: {
      min: { schema: z.coerce.number().optional() },
      max: { schema: z.coerce.number().optional() },
    },
  });
  const rangeSchema = rangeCli.flagsSchema.transform((raw, ctx) => {
    if (raw.min !== undefined && raw.max !== undefined && raw.min > raw.max) {
      ctx.addIssue({ code: "custom", message: "--min must be <= --max" });
      return z.NEVER;
    }
    return raw;
  });

  const cli = defineCommands({
    commands: {
      range: { cli: rangeCli, schema: rangeSchema },
      status: defineCli({ flags: {} }),
    },
  });

  it("runs the override schema instead of the child's own flagsSchema", () => {
    const result = cli.parse(["range", "--min", "10", "--max", "5"]);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.command).toEqual(["range"]);
      expect(result.error.message).toMatch(/--min must be <= --max/);
    }
  });

  it("passes through when the override schema's constraint holds", () => {
    const result = cli.parse(["range", "--min", "5", "--max", "10"]);
    expect(result).toEqual({
      success: true,
      command: ["range"],
      global: {},
      data: { min: 5, max: 10 },
      positionals: [],
    });
  });

  it("leaves plain (non-entry) subcommands dispatching as before", () => {
    const result = cli.parse(["status"]);
    expect(result).toEqual({
      success: true,
      command: ["status"],
      global: {},
      data: {},
      positionals: [],
    });
  });

  it("applies the override schema through parseOrExit too", () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(((): never => {
      throw new Error("process.exit called");
    }) as never);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() =>
      cli.parseOrExit(["range", "--min", "10", "--max", "5"]),
    ).toThrow("process.exit called");
    expect(errorSpy.mock.calls[0]?.[0]).toMatch(/--min must be <= --max/);

    exitSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
