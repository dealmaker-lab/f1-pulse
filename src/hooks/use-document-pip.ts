"use client";

import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

/**
 * useDocumentPip — open a Picture-in-Picture window and render a React tree
 * into it via `ReactDOM.createPortal`.
 *
 * Uses the **Document Picture-in-Picture API**
 * (https://developer.mozilla.org/en-US/docs/Web/API/Document_Picture-in-Picture_API)
 * which is available in Chromium-based browsers (Chrome 116+, Edge 116+) since
 * mid-2023 and shipped in Safari 17.4 (March 2024). Firefox does not yet
 * support it.
 *
 * Important constraints:
 *  - `requestWindow()` MUST be invoked from a user gesture (button click,
 *    keydown, etc). Calling it from `useEffect` will throw.
 *  - The PiP window has its own `document` — it does NOT inherit the parent
 *    page's stylesheets. We copy `<style>` and `<link rel="stylesheet">`
 *    nodes over manually so Tailwind classes survive the cross-window
 *    portal boundary.
 *  - When the user closes the floating window, the `pagehide` event fires on
 *    the PiP window — we use it to drive React state back to `isOpen=false`.
 *  - On SSR `window` is undefined; everything is gated so the hook is safe
 *    to call from a Server Component's client child.
 *
 * @example
 * ```tsx
 * const pip = useDocumentPip({
 *   width: 400,
 *   height: 300,
 *   render: () => <LiveLeaderboardPip />,
 * });
 *
 * return (
 *   <button onClick={pip.open} disabled={!pip.isAvailable}>
 *     {pip.isOpen ? "Open" : "Pop out"}
 *   </button>
 * );
 * ```
 */

/**
 * Minimal typings for the Document PiP API — TS lib.dom does not yet ship
 * `documentPictureInPicture` declarations in every release we target, so we
 * declare just the surface we touch. Marked `unknown`-friendly so the rest
 * of the hook stays type-safe.
 */
interface DocumentPictureInPictureOptions {
  width?: number;
  height?: number;
  disallowReturnToOpener?: boolean;
  preferInitialWindowPlacement?: boolean;
}

interface DocumentPictureInPictureLike {
  requestWindow: (options?: DocumentPictureInPictureOptions) => Promise<Window>;
  readonly window: Window | null;
}

function getDocPip(): DocumentPictureInPictureLike | null {
  if (typeof window === "undefined") return null;
  const candidate = (window as unknown as {
    documentPictureInPicture?: DocumentPictureInPictureLike;
  }).documentPictureInPicture;
  return candidate ?? null;
}

export interface UseDocumentPipOptions {
  /** Initial width of the PiP window in CSS pixels. Browser may clamp. */
  width?: number;
  /** Initial height of the PiP window in CSS pixels. */
  height?: number;
  /**
   * Renders the React tree to mount inside the PiP window. Called with the
   * PiP `<body>` element so the consumer can read its computed size if
   * needed. Return value is passed to `createPortal`.
   */
  render: (container: HTMLElement) => ReactNode;
}

export interface PipController {
  /** True when the browser supports the Document PiP API. */
  isAvailable: boolean;
  /** True while the PiP window is open. */
  isOpen: boolean;
  /**
   * Open the PiP window. MUST be invoked from a user gesture handler
   * (click/keydown). Returns a promise that resolves once the window is
   * fully wired up; rejects if the browser blocks the request.
   */
  open: () => Promise<void>;
  /** Programmatically close the PiP window if one is open. */
  close: () => void;
  /**
   * The portal node produced by `createPortal`. Place this somewhere in
   * your component tree (e.g. immediately after the toggle button) so React
   * keeps the PiP children mounted under the parent's reconciler. Returns
   * `null` while the window is closed.
   */
  portal: ReactNode;
}

/**
 * Copy the parent document's CSS into the PiP window so Tailwind classes
 * resolve. We copy both inlined `<style>` tags (which is where Next.js
 * inlines critical CSS during SSR + the dev runtime) and `<link
 * rel="stylesheet">` references (production builds).
 *
 * We clone nodes rather than moving them — the originals must keep styling
 * the parent page.
 */
function copyStylesIntoPipWindow(pipWindow: Window): void {
  const pipDoc = pipWindow.document;
  // Use a wide selector — Next.js inlines a lot of CSS modules as <style>
  // and ships Tailwind via <link rel="stylesheet">.
  const sources = document.querySelectorAll<HTMLElement>(
    'style, link[rel="stylesheet"]',
  );
  sources.forEach((node) => {
    if (node.tagName === "LINK") {
      const link = node as HTMLLinkElement;
      const clone = pipDoc.createElement("link");
      clone.rel = "stylesheet";
      clone.href = link.href;
      // Preserve `media`, `crossOrigin`, and any data-* attributes.
      if (link.media) clone.media = link.media;
      if (link.crossOrigin) clone.crossOrigin = link.crossOrigin;
      pipDoc.head.appendChild(clone);
    } else {
      // Inline <style> — copy the text content so we don't trigger another
      // network request and so dynamically-mutated runtime styles travel.
      const clone = pipDoc.createElement("style");
      clone.textContent = node.textContent ?? "";
      pipDoc.head.appendChild(clone);
    }
  });
  // Mirror html/body classes so dark-mode / theme variables apply. Next.js
  // typically sets `class="dark"` on <html> in this app.
  pipDoc.documentElement.className = document.documentElement.className;
  pipDoc.body.className = document.body.className;
}

export function useDocumentPip(opts: UseDocumentPipOptions): PipController {
  const { width = 420, height = 340, render } = opts;

  // We hold the open PiP `Window` in a ref so the cleanup path can close it
  // even if the component unmounts after the user has clicked "Pop out".
  const pipWindowRef = useRef<Window | null>(null);
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  // `isAvailable` must run client-side only — `window` is undefined in SSR.
  const [isAvailable, setIsAvailable] = useState(false);

  useEffect(() => {
    setIsAvailable(getDocPip() !== null);
  }, []);

  const close = useCallback((): void => {
    const w = pipWindowRef.current;
    if (w && !w.closed) {
      w.close();
    }
    // The `pagehide` listener will also set state — but if `close()` runs
    // before the listener attaches, reset state directly too.
    pipWindowRef.current = null;
    setContainer(null);
    setIsOpen(false);
  }, []);

  const open = useCallback(async (): Promise<void> => {
    const docPip = getDocPip();
    if (!docPip) {
      // Caller should have disabled the trigger — but defensively throw so
      // any rogue call surface in tests is loud.
      throw new Error("Document Picture-in-Picture API is not available");
    }
    // If a window is already open, re-focus it instead of opening a second.
    if (pipWindowRef.current && !pipWindowRef.current.closed) {
      pipWindowRef.current.focus();
      return;
    }
    const pipWindow = await docPip.requestWindow({ width, height });
    pipWindowRef.current = pipWindow;

    // Build a stable root node we'll portal into. Doing this once means
    // React's reconciler sees the same DOM container across re-renders.
    const root = pipWindow.document.createElement("div");
    root.id = "pip-root";
    // Base styles: full-height body, no scroll bars on the chrome itself.
    // We do this with inline rules so the PiP renders correctly even before
    // copied Tailwind sheets parse.
    root.style.minHeight = "100vh";
    root.style.display = "flex";
    root.style.flexDirection = "column";
    pipWindow.document.body.style.margin = "0";
    pipWindow.document.body.style.background = "#000";
    pipWindow.document.body.style.color = "#fff";
    pipWindow.document.body.style.fontFamily =
      'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    pipWindow.document.body.appendChild(root);

    copyStylesIntoPipWindow(pipWindow);

    // When the user closes the PiP window (via OS chrome or programmatic
    // close), drop our references and flip state.
    const handlePageHide = (): void => {
      pipWindowRef.current = null;
      setContainer(null);
      setIsOpen(false);
    };
    pipWindow.addEventListener("pagehide", handlePageHide);

    setContainer(root);
    setIsOpen(true);
  }, [width, height]);

  // On unmount, close any window we own — otherwise it would orphan with no
  // way for the parent React tree to reach into it again.
  useEffect(() => {
    return () => {
      const w = pipWindowRef.current;
      if (w && !w.closed) {
        w.close();
      }
      pipWindowRef.current = null;
    };
  }, []);

  // Render the consumer's React tree through a portal targeting the PiP
  // window's body. Returns null when no window is open — safe to splat into
  // JSX unconditionally.
  const portal: ReactNode = container
    ? createPortal(render(container), container)
    : null;

  return { isAvailable, isOpen, open, close, portal };
}
