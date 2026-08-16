"use client";

import { create } from "zustand";
import type { Locator } from "@/types/api";
import type { CreditRefusal } from "@/features/billing/hooks";

/**
 * Client only UI state. Server data lives in TanStack Query and is never
 * duplicated here, so there is one answer to "what is the current list".
 */
type UiState = {
  activeNotebookId: string | null;
  railOpen: boolean;
  switcherOpen: boolean;

  viewerOpen: boolean;
  viewerSourceId: string | null;
  /** Where in the source to land, set only when opening from a citation. */
  viewerLocator: Locator | null;
  /**
   * The quoted text of the citation the viewer was opened from.
   *
   * A PDF locator names only a page, which is enough to turn to but not enough
   * to point at. The snippet is what the highlighter matches against inside
   * that page's text layer.
   */
  viewerSnippet: string | null;
  /**
   * Whether the right column is given most of the width.
   *
   * A transcript reads fine in a third of the screen and a video does not: at
   * that width the player is a thumbnail, which is no way to watch anything.
   * The column is draggable, but a video is exactly the case where the reader
   * should not have to discover that, so there is a button for it.
   */
  viewerWide: boolean;

  selectedSourceIds: string[];

  /**
   * A refusal about credits, from wherever it happened.
   *
   * Held here rather than beside each action because there is one dialog and
   * there are four ways to reach it — asking, uploading, an audio overview, a
   * roadmap. Four copies of the same state would drift, and a fifth charged
   * action would have to remember to add a sixth.
   */
  refusal: CreditRefusal | null;

  setActiveNotebook: (id: string | null) => void;
  setRefusal: (refusal: CreditRefusal | null) => void;
  setRailOpen: (open: boolean) => void;
  toggleRail: () => void;
  setSwitcherOpen: (open: boolean) => void;
  toggleSwitcher: () => void;
  setViewerOpen: (open: boolean) => void;
  setViewerSource: (sourceId: string | null) => void;
  /**
   * Returns the right column to the source list without closing it.
   *
   * Distinct from closeViewer: on a wide screen the column is always there,
   * and going back from an open source means showing the list again, not
   * collapsing the whole panel.
   */
  showSourceList: () => void;
  setViewerCitation: (
    citation: {
      sourceId: string | null;
      locator: Locator;
      snippet?: string;
    } | null,
  ) => void;
  closeViewer: () => void;
  setViewerWide: (wide: boolean) => void;
  setSelectedSources: (ids: string[]) => void;
};

export const useUiStore = create<UiState>((set) => ({
  activeNotebookId: null,
  railOpen: false,
  switcherOpen: false,
  viewerOpen: false,
  viewerSourceId: null,
  viewerLocator: null,
  viewerSnippet: null,
  viewerWide: false,
  selectedSourceIds: [],
  refusal: null,

  setActiveNotebook: (id) =>
    set({
      activeNotebookId: id,
      railOpen: false,
      viewerOpen: false,
      viewerSourceId: null,
      viewerLocator: null,
      viewerSnippet: null,
      selectedSourceIds: [],
    }),

  setRailOpen: (railOpen) => set({ railOpen }),
  toggleRail: () => set((state) => ({ railOpen: !state.railOpen })),
  setSwitcherOpen: (switcherOpen) => set({ switcherOpen }),
  toggleSwitcher: () => set((state) => ({ switcherOpen: !state.switcherOpen })),
  setViewerOpen: (viewerOpen) => set({ viewerOpen }),

  /** Opening from the source list: show the document from the top. */
  setViewerSource: (viewerSourceId) =>
    set({
      viewerSourceId,
      viewerLocator: null,
      viewerSnippet: null,
      viewerOpen: viewerSourceId !== null,
    }),

  /** Back to the list, keeping the column itself open. */
  showSourceList: () =>
    set({ viewerSourceId: null, viewerLocator: null, viewerSnippet: null }),

  /** Opening from a citation: additionally carry where to land and highlight. */
  setViewerCitation: (citation) =>
    set({
      viewerSourceId: citation?.sourceId ?? null,
      viewerLocator: citation?.locator ?? null,
      viewerSnippet: citation?.snippet ?? null,
      viewerOpen: citation !== null && citation.sourceId !== null,
    }),

  closeViewer: () =>
    set({
      viewerOpen: false,
      viewerLocator: null,
      viewerSnippet: null,
      // Closing the source gives the width back to the chat, or the next thing
      // opened inherits a layout chosen for a video it is not.
      viewerWide: false,
    }),

  setViewerWide: (viewerWide) => set({ viewerWide }),

  setSelectedSources: (selectedSourceIds) => set({ selectedSourceIds }),

  setRefusal: (refusal) => set({ refusal }),
}));
