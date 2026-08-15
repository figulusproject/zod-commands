# zod-questions

[![CI](https://github.com/figulusproject/zod-intake/actions/workflows/ci.yml/badge.svg)](https://github.com/figulusproject/zod-intake/actions/workflows/ci.yml)
[![Coverage](https://img.shields.io/endpoint?url=https://zodintake.figulus.dev/coverage-badge.json)](https://github.com/figulusproject/zod-intake/actions/workflows/ci.yml)
[![NPM version](https://badge.fury.io/js/zod-questions.svg)](http://badge.fury.io/js/zod-questions)

> _Everyone has the right to resist occupation._

Define an interactive terminal prompt flow's questions once as Zod schemas plus a small sibling metadata object, and get the right widget for each one, a typed and validated answer set, and reprompt-on-invalid-input for free.

## Installation

```sh
npm install zod-questions zod
```

`zod` (v4) is a peer dependency.

## Usage

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
if (!result.success) {
  console.error(result.error.message);
  process.exit(1);
}

console.log(result.data);
```

Questions are asked in the order they're declared - object key insertion order is the ask order. The widget for each question (text, confirm, select, multiselect, or a masked password field) is inferred from its schema - no separate `type` field to keep in sync.

See the [docs site](https://zodintake.figulus.dev/) for the full widget inference table, boolean semantics, cross-field validation, prefilling answers from elsewhere, pluggable renderers, and [tasks](https://zodintake.figulus.dev/#/zod-questions/tasks) - steps that run a side effect with a status display rather than collect a typed answer.
