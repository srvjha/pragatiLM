import {
  BookOpen,
  Briefcase,
  FlaskConical,
  GraduationCap,
  Scale,
  Video,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

/**
 * Starter templates for the empty state.
 *
 * A template here is a name and an intent, not a pre-filled notebook. There is
 * nothing to seed it with: a notebook is only worth anything once it has the
 * person's own sources in it, and shipping fake ones would teach the wrong
 * thing about what the product does.
 *
 * What each one does carry is `firstStep`, the kind of source that makes that
 * notebook work. So the template answers the real question someone has on an
 * empty screen, which is not "what can I name this" but "what do I put in it".
 */
export type NotebookTemplate = {
  id: string;
  icon: LucideIcon;
  name: string;
  blurb: string;
  /** What to add first, shown on the notebook's empty source list. */
  firstStep: string;
};

export const NOTEBOOK_TEMPLATES: NotebookTemplate[] = [
  {
    id: "literature",
    icon: FlaskConical,
    name: "Literature review",
    blurb:
      "Papers side by side, with every claim traceable to the page it came from.",
    firstStep: "Add the PDFs you are reviewing.",
  },
  {
    id: "course",
    icon: GraduationCap,
    name: "Course notes",
    blurb: "Lectures and readings in one place, answerable and timestamped.",
    firstStep: "Add lecture transcripts and your reading list.",
  },
  {
    id: "lectures",
    icon: Video,
    name: "Video series",
    blurb:
      "A run of talks or tutorials, with a learning roadmap built from them.",
    firstStep: "Add the videos, or their VTT transcripts.",
  },
  {
    id: "research",
    icon: BookOpen,
    name: "Topic research",
    blurb: "Articles and pages you have collected, captured as you found them.",
    firstStep: "Add the web pages you have been reading.",
  },
  {
    id: "product",
    icon: Briefcase,
    name: "Product or client",
    blurb:
      "Specs, briefs and call transcripts, so answers cite the actual document.",
    firstStep: "Add the briefs and specs.",
  },
  {
    id: "policy",
    icon: Scale,
    name: "Policy or contracts",
    blurb:
      "Long documents where the exact clause matters more than the summary.",
    firstStep: "Add the documents you need to quote from.",
  },
];
