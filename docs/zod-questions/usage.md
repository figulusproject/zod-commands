# zod-questions

```ts
import { z } from "zod";
import { defineQuestions } from "zod-questions";

const flow = defineQuestions({
  questions: {
    name: { schema: z.string().min(1), message: "What's your name?" },
    role: { schema: z.enum(["admin", "member"]), message: "Pick a role" },
    adminNote: {
      schema: z.string(),
      message: "Anything the other admins should know?",
      when: (answers) => answers.role === "admin",
    },
    notify: {
      schema: z.boolean().default(true),
      message: "Enable notifications?",
    },
  },
});

const result = await flow.ask();
```

Or, for an entrypoint that doesn't need the discriminated result for testing:

```ts
const data = await flow.askOrExit();
```

Questions are asked in the order they're declared. The widget for each one is inferred from its schema:

| Value                             | Schema                                          | Widget                    |
| --------------------------------- | ----------------------------------------------- | ------------------------- |
| String                            | `z.string()`                                    | text                      |
| One of a fixed set of strings     | `z.enum([...])`                                 | select                    |
| Number / bigint / date            | `z.coerce.number()` etc.                        | text, coerced after entry |
| Boolean (native)                  | `z.boolean()`                                   | confirm                   |
| Boolean (typed)                   | `z.stringbool()`                                | text, parsed              |
| Multiple choices from a fixed set | `z.array(z.enum([...]))` + `multiselect: true`  | multiselect               |
| Comma-separated value             | `z.string().transform((raw) => raw.split(","))` | text                      |
| Sensitive value                   | any string-shaped schema + `secret: true`       | password (masked)         |

An array question needs `multiselect: true` (with enum elements) or a `.transform()` from a string - a bare `z.array()` with neither throws at `defineQuestions()` time.

## Booleans

`z.boolean()` renders as a confirm/toggle widget and returns a native `boolean` directly, with zero string parsing. `z.stringbool()` renders as a text widget instead, and the raw answer is parsed the same way a value-taking boolean flag is: case-insensitively against `yes`/`true`/`1`/`on`/`y`/`enabled` and their negatives.

```ts
notify: { schema: z.boolean().default(true), message: "Enable notifications?" } // confirm
subscribe: { schema: z.stringbool().default(true), message: "Subscribe? (yes/no)" } // text, parsed
```

## Validation and retries

An invalid answer reprompts in place - the renderer shows the Zod issue inline and asks again. The discriminated result from `ask()` is reserved for cross-field validation, cancellation, a prefilled value that can't be reprompted, and [tasks](tasks.md):

```ts
type QuestionsErrorKind = "validation" | "cancelled" | "timeout" | "failed";
```

`"timeout"` and `"failed"` come from tasks - a plain flow of `questions` alone only ever produces `"validation"` or `"cancelled"`.

Cross-field validation uses the same override-schema pattern: pass a schema built on `flow.answersSchema` as `ask()`'s second argument.

```ts
const overrideSchema = flow.answersSchema.transform((raw, ctx) => {
  if (raw.min !== undefined && raw.max !== undefined && raw.min > raw.max) {
    ctx.addIssue({ code: "custom", message: "min must be <= max" });
    return z.NEVER;
  }
  return raw;
});

await flow.ask({}, overrideSchema);
```

## Prefilling

`ask({ prefilled })` accepts a partial answers object and skips prompting for any key present in it. A prefilled value that fails its question's schema falls through to a live prompt when a real (interactive) renderer is available - a bad prefilled value shouldn't be worse than a missing one - and only surfaces as a `"validation"` error under a non-interactive renderer, where there's nobody to ask.

## Renderers

Prompt rendering is pluggable. The default is backed by [`@clack/prompts`](https://www.npmjs.com/package/@clack/prompts) - a spinner for tasks, alongside its text/confirm/select/multiselect/password widgets. Pass your own `Renderer` to `ask({ renderer })` to use something else, including the built-in `createCannedRenderer()` for tests and scripting, which feeds pre-recorded answers to each widget call in order and runs a task's `run()` directly, without touching a real terminal.

```ts
import { createCannedRenderer } from "zod-questions";

const result = await flow.ask({
  renderer: createCannedRenderer(["Ada", "admin", true]),
});
```
