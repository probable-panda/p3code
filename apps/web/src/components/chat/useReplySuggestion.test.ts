import { expect, it } from "vite-plus/test";
import { replySuggestionKeyAction } from "./useReplySuggestion";

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
