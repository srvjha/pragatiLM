import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

/**
 * Unmounts between tests. Without it every test renders into the same document
 * and `getByText` starts finding two of everything, which fails as a duplicate
 * match rather than as the thing that actually went wrong.
 */
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

/**
 * jsdom implements neither of these, and both are used by components under test:
 * the rail and the pricing page read media queries, and Base UI's dialogs
 * observe their own size. Absent, they throw before a single assertion runs.
 */
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }),
});

globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;
