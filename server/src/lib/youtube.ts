import { badRequest } from "@/lib/errors";

/**
 * Recognises the URL shapes YouTube actually hands out. Playlist expansion into
 * one source per video happens in the extractor; this only classifies the URL
 * and pulls out the id so the row can be created.
 */
export type YoutubeTarget =
  { kind: "video"; videoId: string } | { kind: "playlist"; playlistId: string };

const HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtu.be",
  "www.youtu.be",
]);

const VIDEO_ID = /^[\w-]{11}$/;
const PLAYLIST_ID = /^[\w-]{12,}$/;

export function parseYoutubeUrl(raw: string): YoutubeTarget {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw badRequest("That does not look like a valid URL.");
  }

  if (!HOSTS.has(url.hostname.toLowerCase())) {
    throw badRequest("That is not a YouTube URL.");
  }

  const listId = url.searchParams.get("list");
  const videoId = url.hostname.toLowerCase().endsWith("youtu.be")
    ? url.pathname.slice(1)
    : (url.searchParams.get("v") ?? url.pathname.replace(/^\/(shorts|embed|live)\//, ""));

  // A watch URL inside a playlist names both. The video is what the user
  // clicked, so it wins unless the URL is a playlist page.
  if (videoId && VIDEO_ID.test(videoId)) return { kind: "video", videoId };
  if (listId && PLAYLIST_ID.test(listId)) return { kind: "playlist", playlistId: listId };

  throw badRequest("That YouTube URL does not name a video or a playlist.");
}
