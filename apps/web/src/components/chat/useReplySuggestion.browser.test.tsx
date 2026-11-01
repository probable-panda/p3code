import { StrictMode, useLayoutEffect } from "react";
import { expect, it, vi } from "vite-plus/test";
import { act, render } from "../../../test/render";
import { useReplySuggestion } from "./useReplySuggestion";

type Input = Parameters<typeof useReplySuggestion>[0];
type Suggestion = ReturnType<typeof useReplySuggestion>;
function Probe(props: { input: Input; onChange: (suggestion: Suggestion) => void }) {
  const suggestion = useReplySuggestion(props.input);
  useLayoutEffect(() => {
    props.onChange(suggestion);
  });
  return null;
}
function setup() {
  let result: Suggestion | null = null;
  return {
    read: () => result!,
    ui: (input: Input) => (
      <StrictMode>
        <Probe
          input={input}
          onChange={(value) => {
            result = value;
          }}
        />
      </StrictMode>
    ),
  };
}

it("generates once in StrictMode and stays dismissed after typing then clearing", async () => {
  const state = setup();
  const request = vi.fn(async () => "Yes, do that.");
  const props = { key: "env/thread/message", enabled: true, request };
  // This hook has no router dependencies.
  await using screen = await render(state.ui(props), { router: false });
  await vi.waitFor(() => expect(state.read().reply).toBe("Yes, do that."));
  expect(request).toHaveBeenCalledTimes(1);
  await act(() => state.read().dismiss());
  await screen.rerender(state.ui({ ...props, enabled: false }));
  await screen.rerender(state.ui(props));
  await vi.waitFor(() => expect(state.read().reply).toBe(""));
  expect(request).toHaveBeenCalledTimes(1);
});
it("refreshes a late native suggestion without undoing dismissal", async () => {
  const state = setup();
  const request = vi.fn(async () => "");
  const props = { key: "A", enabled: true, revision: "", request };
  // This hook has no router dependencies.
  await using screen = await render(state.ui(props), { router: false });
  request.mockResolvedValue("Go ahead.");
  await screen.rerender(state.ui({ ...props, revision: "Go ahead." }));
  await vi.waitFor(() => expect(state.read().reply).toBe("Go ahead."));
  await act(() => state.read().dismiss());
  request.mockResolvedValue("Continue.");
  await screen.rerender(state.ui({ ...props, revision: "Continue." }));
  await vi.waitFor(() => expect(state.read().reply).toBe(""));
  expect(request).toHaveBeenCalledTimes(3);
});
it("rejects a late response from another thread", async () => {
  const state = setup();
  let resolve!: (reply: string) => void;
  const first = new Promise<string>((done) => {
    resolve = done;
  });
  // This hook has no router dependencies.
  await using screen = await render(state.ui({ key: "A", enabled: true, request: () => first }), {
    router: false,
  });
  await screen.rerender(state.ui({ key: "B", enabled: true, request: async () => "Continue B." }));
  await act(async () => {
    resolve("Continue A.");
    await first;
  });
  await vi.waitFor(() => expect(state.read().reply).toBe("Continue B."));
});
it("leaves the normal placeholder on generation failure", async () => {
  const state = setup();
  // This hook has no router dependencies.
  await using _screen = await render(
    state.ui({
      key: "A",
      enabled: true,
      request: async () => {
        throw new Error("unavailable");
      },
    }),
    { router: false },
  );
  await vi.waitFor(() => expect(state.read().reply).toBe(""));
});
it("does not generate while the composer is unavailable", async () => {
  const state = setup();
  const request = vi.fn(async () => "Yes.");
  // This hook has no router dependencies.
  await using screen = await render(state.ui({ key: "A", enabled: false, request }), {
    router: false,
  });
  expect(request).not.toHaveBeenCalled();
  await screen.rerender(state.ui({ key: "A", enabled: true, request }));
  expect(request).toHaveBeenCalledTimes(1);
  await vi.waitFor(() => expect(state.read().reply).toBe("Yes."));
});
