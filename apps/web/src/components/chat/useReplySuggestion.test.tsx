import { act, StrictMode, useLayoutEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { replySuggestionKeyAction, useReplySuggestion } from "./useReplySuggestion";

let root: Root;
let suggestion: ReturnType<typeof useReplySuggestion>;
function Probe(props: { input: Parameters<typeof useReplySuggestion>[0] }) {
  const state = useReplySuggestion(props.input);
  useLayoutEffect(() => {
    suggestion = state;
  });
  return null;
}
async function render(props: Parameters<typeof useReplySuggestion>[0]) {
  await act(() =>
    root.render(
      <StrictMode>
        <Probe input={props} />
      </StrictMode>,
    ),
  );
}
beforeEach(() => {
  const document = { nodeType: 9, addEventListener() {}, removeEventListener() {} };
  const container = {
    nodeType: 1,
    tagName: "DIV",
    namespaceURI: "http://www.w3.org/1999/xhtml",
    ownerDocument: document,
    addEventListener() {},
    removeEventListener() {},
  };
  vi.stubGlobal("document", document);
  vi.stubGlobal("window", { document, HTMLIFrameElement: EventTarget });
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  root = createRoot(container as unknown as HTMLElement);
});
afterEach(async () => {
  await act(() => root.unmount());
  vi.unstubAllGlobals();
});

describe("reply completion", () => {
  it("generates once in StrictMode and stays dismissed after typing then clearing", async () => {
    const request = vi.fn(async () => "Yes, do that.");
    const props = { key: "env/thread/message", enabled: true, request };
    await render(props);
    expect(suggestion.reply).toBe("Yes, do that.");
    expect(request).toHaveBeenCalledTimes(1);
    await act(() => suggestion.dismiss());
    await render({ ...props, enabled: false });
    await render(props);
    expect(suggestion.reply).toBe("");
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("refreshes a late native suggestion without undoing dismissal", async () => {
    const request = vi.fn(async () => "");
    const props = { key: "A", enabled: true, revision: "", request };
    await render(props);
    request.mockResolvedValue("Go ahead.");
    await render({ ...props, revision: "Go ahead." });
    expect(suggestion.reply).toBe("Go ahead.");
    await act(() => suggestion.dismiss());
    request.mockResolvedValue("Continue.");
    await render({ ...props, revision: "Continue." });
    expect(suggestion.reply).toBe("");
    expect(request).toHaveBeenCalledTimes(3);
  });
  it("rejects a late response from another thread", async () => {
    let resolve!: (reply: string) => void;
    const first = new Promise<string>((done) => {
      resolve = done;
    });
    await render({ key: "A", enabled: true, request: () => first });
    await render({ key: "B", enabled: true, request: async () => "Continue B." });
    await act(async () => {
      resolve("Continue A.");
      await first;
    });
    expect(suggestion.reply).toBe("Continue B.");
  });
  it("leaves the normal placeholder on generation failure", async () => {
    await render({
      key: "A",
      enabled: true,
      request: async () => {
        throw new Error("unavailable");
      },
    });
    expect(suggestion.reply).toBe("");
  });
  it("does not generate while the composer is unavailable", async () => {
    const request = vi.fn(async () => "Yes.");
    await render({ key: "A", enabled: false, request });
    expect(request).not.toHaveBeenCalled();
    await render({ key: "A", enabled: true, request });
    expect(request).toHaveBeenCalledTimes(1);
    expect(suggestion.reply).toBe("Yes.");
  });
  it("accepts with Tab, dismisses with Escape, and leaves Enter to normal submission", () => {
    const event = {
      shiftKey: false,
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      isComposing: false,
      keyCode: 0,
    };
    expect(replySuggestionKeyAction("Tab", event, "Yes.", "")).toBe("accept");
    expect(replySuggestionKeyAction("Escape", event, "Yes.", "")).toBe("dismiss");
    expect(replySuggestionKeyAction("Enter", event, "Yes.", "")).toBeNull();
    expect(replySuggestionKeyAction("Tab", event, "Yes.", "My reply")).toBeNull();
    for (const field of ["shiftKey", "altKey", "ctrlKey", "metaKey", "isComposing"]) {
      expect(replySuggestionKeyAction("Tab", { ...event, [field]: true }, "Yes.", "")).toBeNull();
    }
    expect(replySuggestionKeyAction("Tab", { ...event, keyCode: 229 }, "Yes.", "")).toBeNull();
  });
});
