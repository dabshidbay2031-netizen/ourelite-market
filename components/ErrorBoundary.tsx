'use client';

import React from 'react';

interface Props {
  children: React.ReactNode;
  /** When this value changes, a caught error is cleared (e.g. pass the route
      path so navigating away from a broken view recovers automatically). */
  resetKey?: unknown;
  /** Optional label shown in the fallback, e.g. "dashboard". */
  label?: string;
}
interface State { error: Error | null }

/**
 * Catches render/runtime errors in the view tree so ONE broken screen shows a
 * friendly, recoverable message instead of white-screening the whole app.
 * The surrounding chrome (sidebar, nav, cart) stays usable.
 */
export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidUpdate(prev: Props) {
    // Route changed (or other reset signal) → drop the error and re-render.
    if (prev.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Surface it for debugging; swallowing render errors silently is how bugs hide.
    console.error('[ErrorBoundary] view crashed:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="empty-state" style={{ marginTop: 80 }}>
          <div className="empty-icon">⚠️</div>
          <div className="empty-title">Something went wrong</div>
          <div className="empty-sub">
            {this.props.label ? `The ${this.props.label} hit an error.` : 'This page hit an unexpected error.'}{' '}
            You can try again or reload.
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 16, justifyContent: 'center' }}>
            <button className="btn btn-primary" onClick={() => this.setState({ error: null })}>
              Try again
            </button>
            <button className="btn btn-secondary" onClick={() => window.location.reload()}>
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
