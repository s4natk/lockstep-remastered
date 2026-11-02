export function isMacPlatform(): boolean {
  if (typeof navigator === "undefined") {
    return false;
  }
  const platform =
    (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ??
    navigator.platform ??
    "";
  return /mac|iphone|ipad|ipod/i.test(platform);
}

/** Key names as shown in shortcut hints. `Mod` is ⌘ on Apple platforms and Ctrl elsewhere. */
export function keyLabel(key: string, mac: boolean): string {
  switch (key) {
    case "Mod":
      return mac ? "⌘" : "Ctrl";
    case "Shift":
      return mac ? "⇧" : "Shift";
    case "Alt":
      return mac ? "⌥" : "Alt";
    case "Enter":
      return "↵";
    case "Escape":
      return "Esc";
    default:
      return key;
  }
}

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  if (target.isContentEditable || target.closest(".cm-editor")) {
    return true;
  }
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}
