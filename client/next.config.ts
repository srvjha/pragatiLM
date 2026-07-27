import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * The signed-in routes used to live under /app.
   *
   * These are kept because a renamed route does not only break bookmarks. An
   * OAuth round trip already in flight carries the callback URL it started
   * with, so anyone mid sign-in when this shipped comes back to the old path
   * and lands on a 404 having successfully signed in, which is the worst
   * possible moment to show someone a dead end.
   *
   * Order matters: /app/dashboard has to be matched before /app/:notebookId,
   * or "dashboard" is read as a notebook id.
   */
  async redirects() {
    return [
      { source: "/app", destination: "/notebooks", permanent: true },
      { source: "/app/dashboard", destination: "/dashboard", permanent: true },
      {
        source: "/app/:notebookId",
        destination: "/notebooks/:notebookId",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
