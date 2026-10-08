import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "./Button";

type State = { hasError: boolean };

export class AppErrorBoundary extends Component<
  { children: ReactNode },
  State
> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(
      "[app] Unhandled rendering error",
      error,
      info.componentStack,
    );
  }

  render() {
    if (this.state.hasError) {
      return (
        <main role="alert" className="app-error-screen">
          <h1>This page could not be displayed</h1>
          <p>
            Reload the app to try again. If the problem continues, check the API
            status.
          </p>
          <Button type="button" onClick={() => window.location.reload()}>
            Reload
          </Button>
        </main>
      );
    }
    return this.props.children;
  }
}

type TabState = { hasError: boolean; nonce: number };

/**
 * Isolates a single tab so a crash there shows a local fallback instead of
 * breaking the whole dashboard. "Reload this tab" remounts just this route.
 */
export class TabErrorBoundary extends Component<
  { children: ReactNode; name: string },
  TabState
> {
  state: TabState = { hasError: false, nonce: 0 };

  static getDerivedStateFromError(): Partial<TabState> {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(
      `[tab] ${this.props.name} crashed`,
      error,
      info.componentStack,
    );
  }

  private reload = () => {
    this.setState((prev) => ({ hasError: false, nonce: prev.nonce + 1 }));
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="page" role="alert">
          <div className="page-header">
            <div>
              <p className="eyebrow">Something went wrong</p>
              <h1>This tab could not be displayed</h1>
              <p className="muted">
                The rest of the dashboard keeps working. Reload this tab to try
                again.
              </p>
              <Button type="button" onClick={this.reload}>
                Reload this tab
              </Button>
            </div>
          </div>
        </div>
      );
    }
    return <div key={this.state.nonce}>{this.props.children}</div>;
  }
}
