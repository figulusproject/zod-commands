import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  baseTypeTag,
  isBooleanSchema,
  isOptionalOrDefault,
} from "./introspect.js";

describe("baseTypeTag", () => {
  it("returns the type tag of a plain schema", () => {
    expect(baseTypeTag(z.string())).toBe("string");
    expect(baseTypeTag(z.boolean())).toBe("boolean");
    expect(baseTypeTag(z.enum(["a", "b"]))).toBe("enum");
  });

  it("unwraps optional/default/nullable to reach the base tag", () => {
    expect(baseTypeTag(z.boolean().optional())).toBe("boolean");
    expect(baseTypeTag(z.string().default("x"))).toBe("string");
    expect(baseTypeTag(z.string().nullable())).toBe("string");
    expect(baseTypeTag(z.string().optional().default("x"))).toBe("string");
  });

  it("does not unwrap a stringbool to boolean - it's a pipe, not a boolean", () => {
    expect(baseTypeTag(z.stringbool())).not.toBe("boolean");
    expect(baseTypeTag(z.stringbool())).toBe("pipe");
  });
});

describe("isBooleanSchema", () => {
  it("is true only for a bare boolean, through optional/default/nullable", () => {
    expect(isBooleanSchema(z.boolean())).toBe(true);
    expect(isBooleanSchema(z.boolean().optional())).toBe(true);
    expect(isBooleanSchema(z.boolean().default(false))).toBe(true);
    expect(isBooleanSchema(z.boolean().nullable())).toBe(true);
  });

  it("is false for a value-taking stringbool", () => {
    expect(isBooleanSchema(z.stringbool())).toBe(false);
    expect(isBooleanSchema(z.stringbool().default(true))).toBe(false);
  });

  it("is true for coerce.boolean - it's still a native boolean, just with coercion turned on", () => {
    expect(isBooleanSchema(z.coerce.boolean())).toBe(true);
  });

  it("is false for a union of boolean literals - only a bare z.boolean() counts", () => {
    expect(isBooleanSchema(z.union([z.literal(true), z.literal(false)]))).toBe(
      false,
    );
  });

  it("is false for non-boolean schemas", () => {
    expect(isBooleanSchema(z.string())).toBe(false);
    expect(isBooleanSchema(z.number())).toBe(false);
  });
});

describe("isOptionalOrDefault", () => {
  it("is true for .optional() and .default()", () => {
    expect(isOptionalOrDefault(z.string().optional())).toBe(true);
    expect(isOptionalOrDefault(z.string().default("x"))).toBe(true);
  });

  it("is false for a plain schema, including .nullable() alone", () => {
    expect(isOptionalOrDefault(z.string())).toBe(false);
    expect(isOptionalOrDefault(z.boolean())).toBe(false);
    expect(isOptionalOrDefault(z.string().nullable())).toBe(false);
  });
});
