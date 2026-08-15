import { describe, expect, it } from "vitest";
import { z } from "zod";
import { enumOptions, multiselectOptions, widgetFor } from "./widgets.js";

describe("widgetFor", () => {
  it("infers text for a plain string, a coerced number, and a stringbool", () => {
    expect(widgetFor("x", { schema: z.string(), message: "" })).toBe("text");
    expect(widgetFor("x", { schema: z.stringbool(), message: "" })).toBe(
      "text",
    );
    expect(widgetFor("x", { schema: z.coerce.number(), message: "" })).toBe(
      "text",
    );
  });

  it("infers confirm for a native boolean, through optional/default", () => {
    expect(widgetFor("x", { schema: z.boolean(), message: "" })).toBe(
      "confirm",
    );
    expect(
      widgetFor("x", { schema: z.boolean().default(true), message: "" }),
    ).toBe("confirm");
  });

  it("infers select for an enum", () => {
    expect(widgetFor("x", { schema: z.enum(["a", "b"]), message: "" })).toBe(
      "select",
    );
  });

  it("infers password when secret: true, regardless of schema", () => {
    expect(
      widgetFor("x", { schema: z.string(), message: "", secret: true }),
    ).toBe("password");
  });

  it("infers multiselect for an array of enum with multiselect: true", () => {
    expect(
      widgetFor("x", {
        schema: z.array(z.enum(["a", "b"])),
        message: "",
        multiselect: true,
      }),
    ).toBe("multiselect");
  });

  it("throws for an array schema without multiselect: true", () => {
    expect(() =>
      widgetFor("tags", { schema: z.array(z.string()), message: "" }),
    ).toThrow(/multiselect/);
  });

  it("throws for multiselect: true on a non-array schema", () => {
    expect(() =>
      widgetFor("role", {
        schema: z.enum(["a", "b"]),
        message: "",
        multiselect: true,
      }),
    ).toThrow(/array/);
  });
});

describe("enumOptions", () => {
  it("maps enum values to value/label pairs, defaulting label to the value", () => {
    expect(enumOptions(z.enum(["a", "b"]))).toEqual([
      { value: "a", label: "a" },
      { value: "b", label: "b" },
    ]);
  });

  it("overrides labels when given", () => {
    expect(enumOptions(z.enum(["a", "b"]), { a: "Admin" })).toEqual([
      { value: "a", label: "Admin" },
      { value: "b", label: "b" },
    ]);
  });

  it("unwraps optional/default before reading options", () => {
    expect(enumOptions(z.enum(["a", "b"]).optional())).toEqual([
      { value: "a", label: "a" },
      { value: "b", label: "b" },
    ]);
  });
});

describe("multiselectOptions", () => {
  it("maps the array's element enum to value/label pairs", () => {
    expect(multiselectOptions(z.array(z.enum(["a", "b"])))).toEqual([
      { value: "a", label: "a" },
      { value: "b", label: "b" },
    ]);
  });

  it("overrides labels when given", () => {
    expect(
      multiselectOptions(z.array(z.enum(["a", "b"])), { b: "Bee" }),
    ).toEqual([
      { value: "a", label: "a" },
      { value: "b", label: "Bee" },
    ]);
  });
});
