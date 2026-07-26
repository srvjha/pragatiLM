"use client";

import { Component, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * One failing panel must not blank the app. The chat, the rail and the viewer
 * each sit behind their own boundary, so a broken PDF render still leaves the
 * transcript readable.
 */
export class PanelErrorBoundary extends Component<
  { children: ReactNode; label: string },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <AlertTriangle className="text-muted-foreground size-5" />
        <p className="text-sm">
          The {this.props.label} could not be displayed.
        </p>
        <p className="text-muted-foreground max-w-sm text-xs">
          {this.state.error.message}
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => this.setState({ error: null })}
        >
          Try again
        </Button>
      </div>
    );
  }
}
