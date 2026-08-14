# Flag groups

`exclusiveGroups` marks a set of flags as mutually exclusive - at most one may be passed, or, with `required: true`, exactly one must be:

```ts
const cli = defineCli({
  flags: {
    ids: { schema: z.array(z.string()).optional(), multiple: true },
    idsFile: { schema: z.string().optional(), long: "ids-file" },
  },
  exclusiveGroups: [{ flags: ["ids", "idsFile"], required: true }],
});

cli.usage; // "Usage: (--ids <value>... | --ids-file <value>)"
```

Passing more than one member is a parse error ("--ids and --ids-file are mutually exclusive."). With `required: true`, passing none is too ("One of --ids or --ids-file is required."). `cli.usage` renders the group as `(...)` when required or `[...]` when optional, joining members with `|` instead of listing them separately.

Each member's own schema must be `.optional()`/`.default()` - the group is what makes a member optional, so a member with a schema that's required on its own would otherwise fail validation whenever a sibling is chosen instead. `defineCli()` throws immediately if a member's schema isn't optional/default, if a group has fewer than 2 flags, or if a flag appears in more than one group.
