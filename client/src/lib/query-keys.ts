/**
 * One factory for every cache key. Invalidating by a prefix is only reliable if
 * the keys are built in one place, so nothing constructs an array inline.
 */
export const queryKeys = {
  health: ["health"] as const,

  notebooks: {
    all: ["notebooks"] as const,
    list: () => [...queryKeys.notebooks.all, "list"] as const,
    detail: (id: string) => [...queryKeys.notebooks.all, "detail", id] as const,
  },

  chats: {
    all: ["chats"] as const,
    list: (notebookId: string) =>
      [...queryKeys.chats.all, "list", notebookId] as const,
    messages: (chatId: string) =>
      [...queryKeys.chats.all, "messages", chatId] as const,
  },

  billing: {
    all: ["billing"] as const,
    plans: () => [...queryKeys.billing.all, "plans"] as const,
    me: () => [...queryKeys.billing.all, "me"] as const,
    invoices: () => [...queryKeys.billing.all, "invoices"] as const,
  },

  roadmap: (notebookId: string) => ["roadmap", notebookId] as const,
  podcasts: (notebookId: string) => ["podcasts", notebookId] as const,

  sources: {
    all: ["sources"] as const,
    list: (notebookId: string) =>
      [...queryKeys.sources.all, "list", notebookId] as const,
  },
} as const;
