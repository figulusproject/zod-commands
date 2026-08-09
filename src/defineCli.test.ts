import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { defineCli } from "./defineCli.js";

describe("defineCli - long name defaulting", () => {
  it("defaults long to kebab-case(property key)", () => {
    const cli = defineCli({
      flags: { dryRun: { schema: z.boolean().default(false) } },
    });
    expect(cli.parseArgsOptions).toHaveProperty("dry-run");

    const result = cli.parse(["--dry-run"]);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.dryRun).toBe(true);
  });

  it("honors an explicit long override", () => {
    const cli = defineCli({
      flags: {
        configFile: { schema: z.string().optional(), long: "config-file" },
      },
    });
    expect(cli.parseArgsOptions).toHaveProperty("config-file");
    expect(cli.parseArgsOptions).not.toHaveProperty("configFile");

    const result = cli.parse(["--config-file", "/tmp/config.json"]);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.configFile).toBe("/tmp/config.json");
  });

  it("honors a short alias", () => {
    const cli = defineCli({
      flags: { force: { schema: z.boolean().default(false), short: "f" } },
    });
    const result = cli.parse(["-f"]);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.force).toBe(true);
  });
});

describe("defineCli - numeric flags via z.coerce.number()", () => {
  const cli = defineCli({
    flags: {
      timeout: { schema: z.coerce.number().int().min(0).default(1000) },
    },
  });

  it("uses the default when omitted", () => {
    const result = cli.parse([]);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.timeout).toBe(1000);
  });

  it("coerces a valid numeric string", () => {
    const result = cli.parse(["--timeout", "500"]);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.timeout).toBe(500);
  });

  it("rejects a value below min", () => {
    const result = cli.parse(["--timeout", "-1"]);
    expect(result.success).toBe(false);
  });

  it("rejects a non-integer", () => {
    const result = cli.parse(["--timeout", "1.5"]);
    expect(result.success).toBe(false);
  });

  it("rejects a non-numeric string", () => {
    const result = cli.parse(["--timeout", "abc"]);
    expect(result.success).toBe(false);
  });
});

describe("defineCli - multiple (array/repeatable flags)", () => {
  const cli = defineCli({
    flags: {
      tags: { schema: z.array(z.string()).default([]), multiple: true },
    },
  });

  it("collects repeated flags into an array", () => {
    const result = cli.parse(["--tags", "a", "--tags", "b"]);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.tags).toEqual(["a", "b"]);
  });

  it("falls back to the schema default when absent", () => {
    const result = cli.parse([]);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.tags).toEqual([]);
  });
});

describe("defineCli - negatable boolean flags", () => {
  const cli = defineCli({
    flags: {
      progress: { schema: z.boolean().default(true), negatable: true },
    },
  });

  it("--progress sets true", () => {
    const result = cli.parse(["--progress"]);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.progress).toBe(true);
  });

  it("--no-progress sets false", () => {
    const result = cli.parse(["--no-progress"]);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.progress).toBe(false);
  });

  it("neither falls through to the schema default", () => {
    const result = cli.parse([]);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.progress).toBe(true);
  });

  it("passing both is a parse error, not a schema error", () => {
    const result = cli.parse(["--progress", "--no-progress"]);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toMatch(/Cannot pass both/);
      expect(result.error.issues).toEqual([]);
    }
  });

  it("negatable:true on a non-boolean schema throws at defineCli() time", () => {
    expect(() =>
      defineCli({ flags: { x: { schema: z.string(), negatable: true } } }),
    ).toThrow(/negatable/);
  });
});

describe("defineCli - z.stringbool() value-taking booleans", () => {
  const cli = defineCli({
    flags: { color: { schema: z.stringbool().default(true) } },
  });

  it("is registered as a string-typed parseArgs option (not boolean)", () => {
    expect(cli.parseArgsOptions.color?.type).toBe("string");
  });

  it("--color=false resolves to false", () => {
    const result = cli.parse(["--color=false"]);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.color).toBe(false);
  });

  it("--color true resolves to true", () => {
    const result = cli.parse(["--color", "true"]);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.color).toBe(true);
  });
});

describe("defineCli - cross-field validation via overrideFlagsSchema", () => {
  const cli = defineCli({
    flags: {
      min: { schema: z.coerce.number().optional() },
      max: { schema: z.coerce.number().optional() },
    },
  });
  const overrideSchema = cli.flagsSchema.transform((raw, ctx) => {
    if (raw.min !== undefined && raw.max !== undefined && raw.min > raw.max) {
      ctx.addIssue({ code: "custom", message: "--min must be <= --max" });
      return z.NEVER;
    }
    return raw;
  });

  it("fires the cross-field check and surfaces its message", () => {
    const result = cli.parse(["--min", "10", "--max", "5"], overrideSchema);
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error.message).toMatch(/--min must be <= --max/);
  });

  it("passes through when the constraint holds", () => {
    const result = cli.parse(["--min", "5", "--max", "10"], overrideSchema);
    expect(result.success).toBe(true);
  });
});

describe("defineCli - argv normalization", () => {
  const cli = defineCli({ flags: { output: { schema: z.string() } } });

  it("auto-trims when given raw, unsliced process.argv", () => {
    const rawArgv = [process.argv[0]!, process.argv[1]!, "--output", "/tmp/x"];
    const result = cli.parse(rawArgv);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.output).toBe("/tmp/x");
  });

  it("leaves already-trimmed argv untouched", () => {
    const result = cli.parse(["--output", "/tmp/x"]);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.output).toBe("/tmp/x");
  });

  it("doesn't misfire when only argv[0] matches process.argv[0], not argv[1]", () => {
    const cliWithPositionals = defineCli({
      flags: { output: { schema: z.string() } },
      positionals: z.array(z.string()),
    });
    // Only argv[0] matches process.argv[0]; this must not be treated as unsliced process.argv.
    const result = cliWithPositionals.parse([
      process.argv[0]!,
      "--output",
      "/tmp/x",
    ]);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.output).toBe("/tmp/x");
      expect(result.positionals).toEqual([process.argv[0]]);
    }
  });
});

describe("defineCli - error handling", () => {
  const cli = defineCli({ flags: { output: { schema: z.string() } } });

  it("returns success:false (not a throw) for an unknown flag", () => {
    expect(() => cli.parse(["--bogus"])).not.toThrow();
    const result = cli.parse(["--output", "/tmp", "--bogus"]);
    expect(result.success).toBe(false);
  });

  it("returns success:false for a missing required flag", () => {
    const result = cli.parse([]);
    expect(result.success).toBe(false);
  });
});

describe("defineCli - positionals", () => {
  it("validates/transforms the positional array when configured", () => {
    const cli = defineCli({
      flags: { output: { schema: z.string() } },
      positionals: z
        .array(z.string())
        .length(2)
        .transform(([a, b]) => ({ first: a, second: b })),
    });

    const result = cli.parse(["--output", "/tmp", "one", "two"]);
    expect(result.success).toBe(true);
    if (result.success)
      expect(result.positionals).toEqual({ first: "one", second: "two" });

    const bad = cli.parse(["--output", "/tmp", "only-one"]);
    expect(bad.success).toBe(false);
  });

  it("treats a stray positional as a parse error when unconfigured", () => {
    const cli = defineCli({ flags: { output: { schema: z.string() } } });
    const result = cli.parse(["--output", "/tmp", "stray"]);
    expect(result.success).toBe(false);
  });

  it("still accepts a bare schema (no label) and omits positionals from usage", () => {
    const cli = defineCli({
      flags: { output: { schema: z.string() } },
      positionals: z.array(z.string()),
    });
    expect(cli.usage).toBe("Usage: --output <value>");

    const result = cli.parse(["--output", "/tmp", "one", "two"]);
    expect(result.success).toBe(true);
    if (result.success) expect(result.positionals).toEqual(["one", "two"]);
  });

  it("substitutes a flag's placeholder into the auto-generated usage", () => {
    const cli = defineCli({
      flags: {
        output: { schema: z.string(), placeholder: "dir" },
        tag: {
          schema: z.array(z.string()).default([]),
          multiple: true,
          placeholder: "tag",
        },
      },
    });
    expect(cli.usage).toBe("Usage: --output <dir> [--tag <tag>...]");
  });

  it("prepends the label before the flags when positionals carry one", () => {
    const cli = defineCli({
      flags: { output: { schema: z.string() } },
      positionals: {
        schema: z
          .array(z.string())
          .length(2)
          .transform(([source, destination]) => ({ source, destination })),
        label: "<source> <destination>",
      },
    });
    expect(cli.usage).toBe("Usage: <source> <destination> --output <value>");

    const result = cli.parse(["--output", "/tmp", "a", "b"]);
    expect(result.success).toBe(true);
    if (result.success)
      expect(result.positionals).toEqual({ source: "a", destination: "b" });
  });
});

describe("defineCli - parseOrExit", () => {
  const cli = defineCli({ flags: { output: { schema: z.string() } } });
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

  it("returns {data, positionals} directly on success", () => {
    const result = cli.parseOrExit(["--output", "/tmp/x"]);
    expect(result).toEqual({ data: { output: "/tmp/x" }, positionals: [] });
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("prints the error message and usage, then exits 1, on failure", () => {
    expect(() => cli.parseOrExit([])).toThrow("process.exit called");
    expect(errorSpy).toHaveBeenCalledTimes(2);
    expect(errorSpy.mock.calls[1]?.[0]).toBe(cli.usage);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
