"use client";

import { Component, Fragment, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * One failing panel must not blank the app. The chat, the rail and the viewer
 * each sit behind their own boundary, so a broken PDF render still leaves the
 * transcript readable.
 *
 * What it shows matters as much as that it catches. A React error message is
 * written for whoever wrote the component, not for whoever is reading a
 * notebook, so it is folded away behind a disclosure: recoverable enough to
 * paste into a bug report, quiet enough not to be the loudest thing on screen.
 */
export class PanelErrorBoundary extends Component<
  { children: ReactNode; label: string },
  { error: Error | null; attempt: number }
> {
  state: { error: Error | null; attempt: number } = { error: null, attempt: 0 };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Swallowed entirely before this, which made a panel that failed on
    // someone else's machine impossible to diagnose from their console.
    console.error(`[${this.props.label}] panel crashed`, error, info);
  }

  render() {
    const { error, attempt } = this.state;

    // Keyed on the attempt so a retry mounts a fresh subtree. Clearing the
    // error alone re-rendered the very component that had just thrown, with
    // the same props and the same state, so "Try again" reliably failed the
    // same way whenever the fault was in the child's initial render.
    if (!error) return <Fragment key={attempt}>{this.props.children}</Fragment>;

    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <AlertTriangle
          className="text-muted-foreground size-5"
          strokeWidth={1.5}
        />

        <div>
          <p className="text-sm font-medium">
            The {this.props.label} could not be displayed.
          </p>
          <p className="text-muted-foreground mt-1 max-w-sm font-serif text-sm leading-relaxed">
            The rest of the notebook is unaffected, so nothing here has been
            lost.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            this.setState((state) => ({
              error: null,
              attempt: state.attempt + 1,
            }))
          }
        >
          <RotateCw className="size-3.5" />
          Try again
        </Button>

        <details className="mt-2 max-w-sm text-left">
          <summary className="text-muted-foreground hover:text-foreground focus-visible:ring-ring cursor-pointer rounded-sm text-xs focus-visible:ring-2 focus-visible:outline-none">
            Technical detail
          </summary>
          <p className="text-muted-foreground mt-2 font-mono text-[0.7rem] leading-relaxed break-words">
            {error.message}
          </p>
        </details>
      </div>
    );
  }
}
