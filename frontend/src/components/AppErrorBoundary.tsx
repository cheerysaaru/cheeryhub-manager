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
