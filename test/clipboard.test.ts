import { describe, expect, it } from "vitest";

import { toClipboardFailureReason } from "../src/clipboard.js";

describe("clipboard error mapping", () => {
  it("returns Wayland guidance for Linux wl-clipboard failures", () => {
    const reason = toClipboardFailureReason("spawn wl-copy ENOENT", "linux");
    expect(reason.toLowerCase()).toContain("wl-clipboard");
  });

  it("returns X11 guidance for Linux xclip/xsel/display failures", () => {
    const xclipReason = toClipboardFailureReason("spawn xclip ENOENT", "linux");
    const displayReason = toClipboardFailureReason("Can't open display: :0", "linux");

    expect(xclipReason.toLowerCase()).toContain("xclip");
    expect(displayReason.toLowerCase()).toContain("display");
  });

  it("falls back to generic message on non-linux platforms", () => {
    const reason = toClipboardFailureReason("Some clipboard error", "darwin");
    expect(reason).toContain("Some clipboard error");
  });
});
