import type { ErrorInfo, ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { Component, Fragment } from "react";

interface Props {
  /** App name, shown in the crash card. */
  appName: string;
  /** Close the window entirely (wired to the window store in `Window`). */
  onClose: () => void;
  children: ReactNode;
}

interface State {
  error: Error | null;
  /** Bumped on "Reload app" so the child subtree remounts from scratch. */
  resetKey: number;
}

/**
 * Per-window error boundary (H4): a thrown render error in one app shows an
 * in-window crash card instead of unmounting the whole React tree — the shell
 * and every other window keep working. "Reload app" remounts the app fresh;
 * "Close window" removes it.
 */
export class WindowErrorBoundary extends Component<Props, State> {
  state: State = { error: null, resetKey: 0 };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`[kagami] "${this.props.appName}" crashed:`, error, info.componentStack);
  }

  reload = (): void => {
    // Clearing the error remounts the subtree; the changed key guarantees a
    // fresh mount even if the previous instance left bad state behind.
    this.setState(s => ({ error: null, resetKey: s.resetKey + 1 }));
  };

  render(): ReactNode {
    const { error } = this.state;
    if (!error) {
      return <Fragment key={this.state.resetKey}>{this.props.children}</Fragment>;
    }

    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-surface px-8 text-center select-none">
        <AlertTriangle className="size-7 text-(--ctl1)" strokeWidth={1.6} />
        <div className="space-y-1">
          <div className="text-[13.5px] font-semibold text-ink">
            {this.props.appName}
            {" "}
            stopped working
          </div>
          <p className="max-w-64 text-[12px] leading-relaxed text-ink-2">
            The app hit an unexpected error. Reloading it usually clears things up;
            the rest of your desktop is unaffected.
          </p>
        </div>
        {error.message && (
          <code className="max-w-72 truncate rounded-btn bg-ph px-2 py-1 font-mono text-[11px] text-ink-2">
            {error.message}
          </code>
        )}
        <div className="mt-1 flex gap-2">
          <button
            type="button"
            className="rounded-btn bg-accent px-3 py-1.5 text-[12px] font-semibold text-white"
            onClick={this.reload}
          >
            Reload app
          </button>
          <button
            type="button"
            className="rounded-btn bg-ph px-3 py-1.5 text-[12px] font-medium text-ink hover:bg-surface-2"
            onClick={this.props.onClose}
          >
            Close window
          </button>
        </div>
      </div>
    );
  }
}
