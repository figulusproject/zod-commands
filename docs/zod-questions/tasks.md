# Tasks

Some steps in a flow aren't collecting a typed answer - they're running a side effect with a status display: waiting on a child process, a webhook, or any other external event. A `tasks` map sits alongside `questions`, runs after every question completes, and shares the same `when()` mechanism:

```ts
const flow = defineQuestions({
  questions: {
    authMethod: {
      schema: z.enum(["webauth", "otp"]),
      message: "How do you want to authenticate?",
    },
    otpCode: {
      schema: z.string().length(6),
      message: "Enter the 6-digit code",
      when: (answers) => answers.authMethod === "otp",
    },
  },
  tasks: {
    npmLogin: {
      message: "Waiting for browser confirmation...",
      when: (answers) => answers.authMethod === "webauth",
      timeoutMs: 5 * 60_000,
      run: async ({ update, signal }) => {
        const child = spawnNpmLogin();
        child.stdout.on("data", (chunk) => {
          const url = extractAuthUrl(chunk);
          if (url) update(`Open ${url} to confirm...`);
        });
        return waitForEvent(child, "login-complete", signal);
      },
    },
  },
});
```

`timeoutMs` is enforced by the engine itself, racing against `run()`, not left to `run()` to implement. On timeout it aborts `signal` and resolves with `{ success: false, error: { kind: "timeout", step } }` - `run()` is expected to react to `signal` (pass it to `child_process.spawn({ signal })`, `fetch(url, { signal })`, etc.) and clean up, but the engine doesn't wait for that before returning.

A task without a `schema` is a pure side effect: its stored result is always `undefined`, regardless of what `run()` returns. With a `schema`, the resolved value is validated the same way a question's answer is.

If `run()` throws for a reason other than the timeout, that surfaces as `{ kind: "failed", message }`, carrying the thrown error's message. `"cancelled"` covers a renderer's own cancel gesture during a task (Ctrl+C on the default spinner), same as it does for a question.
