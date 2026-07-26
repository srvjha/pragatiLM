"use client";

import { create } from "zustand";
import type { Locator } from "@/types/api";

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

  selectedSourceIds: string[];

  setActiveNotebook: (id: string | null) => void;
  setRailOpen: (open: boolean) => void;
  toggleRail: () => void;
  setSwitcherOpen: (open: boolean) => void;
  toggleSwitcher: () => void;
  setViewerOpen: (open: boolean) => void;
  setViewerSource: (sourceId: string | null) => void;
  setViewerCitation: (
    citation: { sourceId: string | null; locator: Locator } | null,
  ) => void;
  closeViewer: () => void;
  setSelectedSources: (ids: string[]) => void;
};

export const useUiStore = create<UiState>((set) => ({
  activeNotebookId: null,
  railOpen: false,
  switcherOpen: false,
  viewerOpen: false,
  viewerSourceId: null,
  viewerLocator: null,
  selectedSourceIds: [],

  setActiveNotebook: (id) =>
    set({
      activeNotebookId: id,
      railOpen: false,
      viewerOpen: false,
      viewerSourceId: null,
      viewerLocator: null,
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
      viewerOpen: viewerSourceId !== null,
    }),

  /** Opening from a citation: additionally carry where to land and highlight. */
  setViewerCitation: (citation) =>
    set({
      viewerSourceId: citation?.sourceId ?? null,
      viewerLocator: citation?.locator ?? null,
      viewerOpen: citation !== null && citation.sourceId !== null,
    }),

  closeViewer: () => set({ viewerOpen: false, viewerLocator: null }),

  setSelectedSources: (selectedSourceIds) => set({ selectedSourceIds }),
}));
