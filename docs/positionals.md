# Positionals

```ts
const cli = defineCli({
  flags: { output: { schema: z.string() } },
  positionals: z
    .array(z.string())
    .length(2)
    .transform(([source, destination]) => ({ source, destination })),
});
```

Omit `positionals` and a stray bare argument is a parse error.

`positionals` also accepts `{ schema, label }` to include the positionals in the auto-generated `cli.usage`, prepended before the flags:

```ts
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

cli.usage; // "Usage: <source> <destination> --output <value>"
```
