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

  /**
   * The admin dashboard. Keyed under one prefix so a grant can invalidate the
   * panels it changed without naming every window the tables might be showing.
   */
  admin: {
    all: ["admin"] as const,
    me: () => [...queryKeys.admin.all, "me"] as const,
    overview: () => [...queryKeys.admin.all, "overview"] as const,
    signups: (days: number) =>
      [...queryKeys.admin.all, "signups", days] as const,
    usersAll: () => [...queryKeys.admin.all, "users"] as const,
    users: (limit: number) => [...queryKeys.admin.usersAll(), limit] as const,
    ai: (days: number) => [...queryKeys.admin.all, "ai", days] as const,
    performance: (days: number) =>
      [...queryKeys.admin.all, "performance", days] as const,
    audit: () => [...queryKeys.admin.all, "audit"] as const,
  },

  roadmap: (notebookId: string) => ["roadmap", notebookId] as const,
  podcasts: (notebookId: string) => ["podcasts", notebookId] as const,

  sources: {
    all: ["sources"] as const,
    list: (notebookId: string) =>
      [...queryKeys.sources.all, "list", notebookId] as const,
  },
} as const;
