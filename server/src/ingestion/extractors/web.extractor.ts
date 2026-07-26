import { request, interceptors, Agent } from "undici";
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import * as cheerio from "cheerio";
import { assertSafeUrl } from "@/lib/url-safety";
import {
  ExtractionError,
  type Extractor,
  type ExtractorInput,
  type ExtractionResult,
} from "./types";
import type { Block } from "./types";

const MAX_HTML_BYTES = 5 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 20_000;

// Redirects are followed through an interceptor rather than a request option,
// and bounded so a redirect loop cannot hold the worker open.
const redirectingAgent = new Agent().compose(interceptors.redirect({ maxRedirections: 3 }));

/** Injected in tests so the extractor can be exercised without a network. */
export type HtmlFetcher = (url: string) => Promise<{ html: string; finalUrl: string }>;

export async function fetchHtml(url: string): Promise<{ html: string; finalUrl: string }> {
  // Re-checked here, not just at create time: a hostname can resolve differently
  // between the two, which is the DNS rebinding case.
  await assertSafeUrl(url);

  let response;
  try {
    response = await request(url, {
      dispatcher: redirectingAgent,
      headersTimeout: FETCH_TIMEOUT_MS,
      bodyTimeout: FETCH_TIMEOUT_MS,
      headers: {
        // Some sites serve a challenge page to an unrecognised agent, which
        // produces an empty article rather than an error.
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        accept: "text/html,application/xhtml+xml",
      },
    });
  } catch {
    throw new ExtractionError("That page could not be reached.");
  }

  if (response.statusCode >= 400) {
    throw new ExtractionError(
      response.statusCode === 403 || response.statusCode === 401
        ? `The site returned ${response.statusCode} and refused the request. Try pasting the text as a Text source instead.`
        : `The site returned ${response.statusCode}.`,
    );
  }

  const contentType = String(response.headers["content-type"] ?? "");
  if (contentType && !contentType.includes("html") && !contentType.includes("xml")) {
    throw new ExtractionError(`That URL returned ${contentType.split(";")[0]}, not a web page.`);
  }

  return { html: await readCapped(response.body), finalUrl: url };
}

async function readCapped(body: AsyncIterable<Buffer | string>): Promise<string> {
  const chunks: Buffer[] = [];
  let total = 0;

  for await (const chunk of body) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.byteLength;
    if (total > MAX_HTML_BYTES) throw new ExtractionError("That page is too large to import.");
    chunks.push(buffer);
  }

  return Buffer.concat(chunks).toString("utf8");
}

export function createWebExtractor(fetcher: HtmlFetcher = fetchHtml): Extractor {
  return {
    type: "WEB",

    async extract(input: ExtractorInput): Promise<ExtractionResult> {
      if (!input.originalUrl) {
        throw new ExtractionError("This web source has no URL.");
      }

      const { html, finalUrl } = await fetcher(input.originalUrl);
      await input.onProgress?.("Reading the page", 40);

      const dom = new JSDOM(html, { url: finalUrl });
      const document = dom.window.document;

      // Readability mutates the document it is given, so the fallback parses the
      // original HTML string rather than the leftovers.
      const article = new Readability(document.cloneNode(true) as typeof document).parse();

      const articleHtml = article?.content?.trim();
      const blocks =
        articleHtml && articleHtml.length > 0
          ? blocksFromHtml(articleHtml)
          : blocksFromHtml(html, true);

      if (blocks.length === 0) {
        throw new ExtractionError(
          "No readable article text was found on that page. It may render entirely in the browser. Try pasting the text as a Text source instead.",
        );
      }

      const title = article?.title?.trim() ?? document.title.trim();
      const readerHtml = articleHtml ?? html;

      return {
        ...(title ? { title } : {}),
        blocks,
        metadata: {
          charCount: blocks.reduce((total, block) => total + block.text.length, 0),
          capturedAt: new Date().toISOString(),
          ...(article?.byline ? { author: article.byline } : {}),
        },
        // FR-5.9: what the model read is what the viewer shows, even if the site
        // later goes down or blocks embedding.
        captured: {
          filename: "reader.html",
          mimeType: "text/html",
          bytes: Buffer.from(readerHtml, "utf8"),
        },
      };
    },
  };
}

/**
 * Walks the article in document order, keeping the heading path above each
 * block so a citation can say which section it came from and the viewer can
 * scroll to it. Character offsets are against the concatenated block text.
 */
function blocksFromHtml(html: string, fallback = false): Block[] {
  const $ = cheerio.load(html);

  if (fallback) {
    $("script, style, nav, header, footer, aside, noscript, form").remove();
  }

  const blocks: Block[] = [];
  const headingPath: string[] = [];
  let offset = 0;

  $("h1, h2, h3, h4, h5, h6, p, li, blockquote, pre").each((_index, element) => {
    const tag = element.tagName.toLowerCase();
    const text = $(element).text().replace(/\s+/g, " ").trim();

    if (text.length === 0) return;

    if (tag.startsWith("h")) {
      const level = Number(tag.slice(1));
      headingPath.length = Math.max(0, level - 1);
      headingPath[level - 1] = text;
    }

    blocks.push({
      text,
      locator: {
        kind: "web",
        headingPath: headingPath.filter(Boolean),
        startChar: offset,
        endChar: offset + text.length,
      },
    });

    offset += text.length + 1;
  });

  return blocks;
}

export const webExtractor = createWebExtractor();
