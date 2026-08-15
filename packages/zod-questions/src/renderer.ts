export const CANCELLED = Symbol("zod-questions/cancelled");

export interface TextOpts {
  message: string;
  placeholder?: string;
  initialValue?: string;
  validate?: (raw: string | undefined) => string | undefined;
}

export interface ConfirmOpts {
  message: string;
  initialValue?: boolean;
}

export interface SelectOpts {
  message: string;
  options: { value: string; label: string; hint?: string }[];
  initialValue?: string;
}

export interface MultiselectOpts {
  message: string;
  options: { value: string; label: string; hint?: string }[];
  initialValues?: string[];
}

export interface TaskOpts {
  message: string;
  run: (ctx: {
    update: (msg: string) => void;
    signal: AbortSignal;
  }) => Promise<unknown>;
  /** Aborted by the engine on timeout. A renderer with its own cancel gesture (e.g. Ctrl+C on a spinner) may resolve CANCELLED without running to completion. */
  signal: AbortSignal;
}

export interface Renderer {
  /** False for a canned/scripted renderer with nobody to reprompt on invalid input. */
  readonly interactive: boolean;
  text(opts: TextOpts): Promise<string | typeof CANCELLED>;
  confirm(opts: ConfirmOpts): Promise<boolean | typeof CANCELLED>;
  select(opts: SelectOpts): Promise<string | typeof CANCELLED>;
  multiselect(opts: MultiselectOpts): Promise<string[] | typeof CANCELLED>;
  password(opts: TextOpts): Promise<string | typeof CANCELLED>;
  task(opts: TaskOpts): Promise<unknown | typeof CANCELLED>;
}

/**
 * Feeds pre-recorded answers to each widget call in order, for tests and scripting.
 * Ask order is deterministic (question insertion order plus `when()`), so a plain
 * queue needs no key to match answers up by - the Nth widget call gets the Nth entry.
 */
export function createCannedRenderer(queue: unknown[]): Renderer {
  let index = 0;
  function next(): unknown {
    if (index >= queue.length) {
      throw new Error("zod-questions: canned renderer ran out of answers.");
    }
    return queue[index++];
  }
  return {
    interactive: false,
    text: async () => next() as string | typeof CANCELLED,
    confirm: async () => next() as boolean | typeof CANCELLED,
    select: async () => next() as string | typeof CANCELLED,
    multiselect: async () => next() as string[] | typeof CANCELLED,
    password: async () => next() as string | typeof CANCELLED,
    // Runs the real `run()` rather than pulling from the queue - a task is a side
    // effect to exercise directly in a test, not an answer to script in advance.
    task: async ({ run, signal }) => run({ update: () => {}, signal }),
  };
}
