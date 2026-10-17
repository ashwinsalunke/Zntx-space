import React from "react";

/** Keep navigation and saved workspace data available when one tool fails to render. */
export default class ErrorBoundary extends React.Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    return <section className="page" role="alert">
      <div className="empty">
        <h1>This tool couldn’t open</h1>
        <p>Your saved workspace has not been cleared. Try opening the tool again, or return home to continue.</p>
        <div className="button-row">
          <button className="btn primary" type="button" onClick={() => this.setState({ failed: false })}>Try again</button>
          <a className="btn" href="/">Return home</a>
        </div>
      </div>
    </section>;
  }
}
