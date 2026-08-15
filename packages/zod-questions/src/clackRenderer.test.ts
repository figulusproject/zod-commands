import { describe, expect, it, vi } from "vitest";

const cancelSymbol = Symbol("cancel");

vi.mock("@clack/prompts", () => ({
  text: vi.fn(),
  confirm: vi.fn(),
  select: vi.fn(),
  multiselect: vi.fn(),
  password: vi.fn(),
  spinner: vi.fn(),
  isCancel: (value: unknown) => value === cancelSymbol,
}));

function createFakeSpinner() {
  return {
    start: vi.fn(),
    stop: vi.fn(),
    cancel: vi.fn(),
    error: vi.fn(),
    message: vi.fn(),
    clear: vi.fn(),
    isCancelled: false,
  };
}

const clack = await import("@clack/prompts");
const { CANCELLED } = await import("./renderer.js");
const { clackRenderer } = await import("./clackRenderer.js");

describe("clackRenderer", () => {
  it("forwards text opts and returns the value on success", async () => {
    vi.mocked(clack.text).mockResolvedValueOnce("Ada");
    const result = await clackRenderer.text({ message: "Name?" });
    expect(result).toBe("Ada");
    expect(clack.text).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Name?" }),
    );
  });

  it("maps a cancelled text prompt to CANCELLED", async () => {
    vi.mocked(clack.text).mockResolvedValueOnce(cancelSymbol as never);
    expect(await clackRenderer.text({ message: "Name?" })).toBe(CANCELLED);
  });

  it("forwards confirm and maps cancellation", async () => {
    vi.mocked(clack.confirm).mockResolvedValueOnce(true);
    expect(await clackRenderer.confirm({ message: "OK?" })).toBe(true);

    vi.mocked(clack.confirm).mockResolvedValueOnce(cancelSymbol as never);
    expect(await clackRenderer.confirm({ message: "OK?" })).toBe(CANCELLED);
  });

  it("forwards select and maps cancellation", async () => {
    vi.mocked(clack.select).mockResolvedValueOnce("admin");
    expect(
      await clackRenderer.select({
        message: "Role?",
        options: [{ value: "admin", label: "Admin" }],
      }),
    ).toBe("admin");

    vi.mocked(clack.select).mockResolvedValueOnce(cancelSymbol as never);
    expect(await clackRenderer.select({ message: "Role?", options: [] })).toBe(
      CANCELLED,
    );
  });

  it("forwards multiselect and maps cancellation", async () => {
    vi.mocked(clack.multiselect).mockResolvedValueOnce(["a", "b"]);
    expect(
      await clackRenderer.multiselect({ message: "Tags?", options: [] }),
    ).toEqual(["a", "b"]);

    vi.mocked(clack.multiselect).mockResolvedValueOnce(cancelSymbol as never);
    expect(
      await clackRenderer.multiselect({ message: "Tags?", options: [] }),
    ).toBe(CANCELLED);
  });

  it("forwards password and maps cancellation", async () => {
    vi.mocked(clack.password).mockResolvedValueOnce("hunter2");
    expect(await clackRenderer.password({ message: "Secret?" })).toBe(
      "hunter2",
    );

    vi.mocked(clack.password).mockResolvedValueOnce(cancelSymbol as never);
    expect(await clackRenderer.password({ message: "Secret?" })).toBe(
      CANCELLED,
    );
  });

  it("starts a spinner, forwards update() to spinner.message, and stops on success", async () => {
    const fakeSpinner = createFakeSpinner();
    vi.mocked(clack.spinner).mockReturnValueOnce(fakeSpinner as never);
    const controller = new AbortController();

    const result = await clackRenderer.task({
      message: "Working...",
      signal: controller.signal,
      run: async ({ update }) => {
        update("halfway");
        return "done";
      },
    });

    expect(result).toBe("done");
    expect(fakeSpinner.start).toHaveBeenCalledWith("Working...");
    expect(fakeSpinner.message).toHaveBeenCalledWith("halfway");
    expect(fakeSpinner.stop).toHaveBeenCalledWith("Working...");
    expect(clack.spinner).toHaveBeenCalledWith(
      expect.objectContaining({ signal: controller.signal }),
    );
  });

  it("calls spinner.error and rethrows when run() throws", async () => {
    const fakeSpinner = createFakeSpinner();
    vi.mocked(clack.spinner).mockReturnValueOnce(fakeSpinner as never);
    const controller = new AbortController();

    await expect(
      clackRenderer.task({
        message: "Working...",
        signal: controller.signal,
        run: async () => {
          throw new Error("boom");
        },
      }),
    ).rejects.toThrow("boom");
    expect(fakeSpinner.error).toHaveBeenCalledWith("boom");
  });

  it("resolves CANCELLED and calls spinner.cancel when the spinner's onCancel fires", async () => {
    const fakeSpinner = createFakeSpinner();
    let onCancel: (() => void) | undefined;
    vi.mocked(clack.spinner).mockImplementationOnce((opts) => {
      onCancel = opts?.onCancel;
      return fakeSpinner as never;
    });
    const controller = new AbortController();

    const result = await clackRenderer.task({
      message: "Working...",
      signal: controller.signal,
      run: () =>
        new Promise((resolve) => {
          onCancel?.();
          resolve("too-late");
        }),
    });

    expect(result).toBe(CANCELLED);
    expect(fakeSpinner.cancel).toHaveBeenCalledWith("Cancelled.");
  });
});
