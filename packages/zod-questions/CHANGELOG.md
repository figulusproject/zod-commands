# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.1.0] - 2026-08-15

### Added

- `defineQuestions()`: declare an interactive prompt flow's questions as Zod schemas plus a small sibling metadata object, and get the right widget per question (text, confirm, select, multiselect, password), a typed and validated answer set, and reprompt-on-invalid-input.
- `flow.ask(options?, overrideAnswersSchema?)` / `flow.askOrExit(...)`: a discriminated result and an exit-on-failure variant, including cross-field validation via a schema built on `flow.answersSchema`.
- `when(answers)` per-question branching, evaluated against answers collected so far.
- `ask({ prefilled })`: skips prompting for any key already present in a partial answers object, falling back to a live prompt on an invalid value when the renderer is interactive.
- Pluggable `Renderer` interface. Ships a default backed by `@clack/prompts` and a `createCannedRenderer()` for tests and scripting.
- `QuestionsError` with a `kind` of `"validation" | "cancelled" | "timeout" | "failed"` and a `step` marking which question or task was in flight.
- `tasks` map alongside `questions`: steps that run a side effect with a status display rather than collect a typed answer, sharing the same declaration order and `when()` mechanism. `timeoutMs` is enforced by the engine via a race against `run()`, aborting an `AbortSignal` passed to `run()` on timeout. A task without a `schema` is a pure side effect. With one, its resolved value is validated the same way a question's answer is. `run()` throwing surfaces as `{ kind: "failed", message }`.
