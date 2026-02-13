import clipboard from "clipboardy";

import type { ClipboardResult } from "./types.js";

export const toClipboardFailureReason = (
  rawErrorMessage: string,
  platform: NodeJS.Platform = process.platform
): string => {
  const normalizedMessage = rawErrorMessage.toLowerCase();

  if (platform === "linux") {
    const isWaylandClipboardIssue =
      normalizedMessage.includes("wl-clipboard") ||
      normalizedMessage.includes("wl-copy") ||
      normalizedMessage.includes("wayland_display") ||
      normalizedMessage.includes("wayland");

    if (isWaylandClipboardIssue) {
      return "Clipboard unavailable. Install `wl-clipboard` and ensure your Wayland session is active.";
    }

    const isX11ClipboardIssue =
      normalizedMessage.includes("xclip") ||
      normalizedMessage.includes("xsel") ||
      normalizedMessage.includes("display") ||
      normalizedMessage.includes("$display");

    if (isX11ClipboardIssue) {
      return "Clipboard unavailable. Install `xclip` (or `xsel`) and ensure `DISPLAY` is set.";
    }
  }

  return `Clipboard unavailable. ${rawErrorMessage}`;
};

export const copyToClipboard = async (text: string): Promise<ClipboardResult> => {
  try {
    await clipboard.write(text);
    return { ok: true };
  } catch (error: unknown) {
    const rawErrorMessage =
      error instanceof Error ? error.message : "Unknown clipboard failure.";
    const reason = toClipboardFailureReason(rawErrorMessage);
    return { ok: false, reason };
  }
};
