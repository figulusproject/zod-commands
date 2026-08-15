import * as clack from "@clack/prompts";
import { CANCELLED } from "./renderer.js";
import type { Renderer } from "./renderer.js";

/** The default Renderer, backed by @clack/prompts. Swap it out via `ask({ renderer })`. */
export const clackRenderer: Renderer = {
  interactive: true,
  async text({ message, placeholder, initialValue, validate }) {
    const result = await clack.text({
      message,
      placeholder,
      initialValue,
      validate,
    });
    return clack.isCancel(result) ? CANCELLED : result;
  },
  async confirm({ message, initialValue }) {
    const result = await clack.confirm({ message, initialValue });
    return clack.isCancel(result) ? CANCELLED : result;
  },
  async select({ message, options, initialValue }) {
    const result = await clack.select({ message, options, initialValue });
    return clack.isCancel(result) ? CANCELLED : (result as string);
  },
  async multiselect({ message, options, initialValues }) {
    const result = await clack.multiselect({
      message,
      options,
      initialValues,
      required: false,
    });
    return clack.isCancel(result) ? CANCELLED : (result as string[]);
  },
  async password({ message, validate }) {
    const result = await clack.password({ message, mask: "*", validate });
    return clack.isCancel(result) ? CANCELLED : result;
  },
  async task({ message, run, signal }) {
    let cancelled = false;
    const s = clack.spinner({
      signal,
      onCancel: () => {
        cancelled = true;
      },
    });
    s.start(message);
    try {
      const result = await run({ update: (msg) => s.message(msg), signal });
      if (cancelled || s.isCancelled) {
        s.cancel("Cancelled.");
        return CANCELLED;
      }
      s.stop(message);
      return result;
    } catch (err) {
      if (cancelled || s.isCancelled) {
        s.cancel("Cancelled.");
        return CANCELLED;
      }
      s.error(err instanceof Error ? err.message : String(err));
      throw err;
    }
  },
};
