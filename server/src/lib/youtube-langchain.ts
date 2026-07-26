import { YoutubeLoader } from "@langchain/community/document_loaders/web/youtube";
import { childLogger } from "@/lib/logger";

const log = childLogger("youtube:langchain");

/**
 * Captions via LangChain's YoutubeLoader.
 *
 * The loader returns the transcript as one Document of plain text, with no per
 * cue timings, so a source that arrives this way carries character range
 * locators rather than timestamps. A citation still opens the transcript at
 * the right passage; it just cannot seek the player to a second.
 *
 * Language matters here. The loader takes one language code and fails if the
 * video has no track in it, so the caller passes the codes the video actually
 * has, English first when it is among them.
 */
export type LangchainTranscript = { text: string; title?: string; author?: string };

export async function fetchTranscriptViaLangchain(
  url: string,
  languages: string[],
): Promise<LangchainTranscript | null> {
  // Deduplicated and ordered, with English preferred. A video captioned only in
  // Hindi is still worth indexing in Hindi.
  const ordered = [...new Set(["en", ...languages])];

  for (const language of ordered) {
    try {
      const loader = YoutubeLoader.createFromUrl(url, { language, addVideoInfo: true });
      const documents = await loader.load();

      const text = documents
        .map((document) => document.pageContent)
        .join("\n\n")
        .trim();

      if (text.length === 0) continue;

      const metadata = documents[0]?.metadata as { title?: string; author?: string } | undefined;

      log.info({ language, chars: text.length }, "transcript loaded");

      return {
        text,
        ...(metadata?.title ? { title: metadata.title } : {}),
        ...(metadata?.author ? { author: metadata.author } : {}),
      };
    } catch (error) {
      log.debug({ err: error, language }, "no transcript in this language, trying the next");
    }
  }

  return null;
}
