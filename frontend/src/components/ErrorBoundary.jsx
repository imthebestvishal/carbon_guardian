import { Component } from "react";

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error) {
    // Keep in console for debugging local runtime failures.
    // eslint-disable-next-line no-console
    console.error("Runtime UI error:", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 24, fontFamily: "Inter, sans-serif" }}>
          <h2 style={{ margin: 0 }}>UI failed to load</h2>
          <p style={{ marginTop: 8 }}>
            {String(this.state.error?.message || "Unexpected runtime error")}
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}
