/*
 * Copyright 2026 The Yorkie Authors. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = { children: ReactNode };
type State = { error?: Error; componentStack: string };

/**
 * `ErrorBoundary` keeps a rendering failure inside the panel.
 *
 * The panel renders whatever a document holds, and a value it cannot render
 * throws during React's render phase. React answers an unhandled throw by
 * unmounting the tree, so without a boundary the whole panel goes blank and
 * takes the reason with it: the user is left with an empty tab and an
 * exception in a console they are not looking at.
 *
 * Reloading the inspected page is enough to come back, because the panel
 * rebuilds its state from the SDK, so the recovery offered here is a remount
 * rather than anything that tries to repair the document.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { componentStack: '' };

  /**
   * `getDerivedStateFromError` records the failure so the next render can
   * show it instead of the tree that threw.
   */
  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  /**
   * `componentDidCatch` keeps the component stack, which names the part of
   * the panel that could not render, and reports the failure to the console.
   */
  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({ componentStack: info.componentStack || '' });
    console.error('[YD] Devtools panel failed to render.', error, info);
  }

  /**
   * `render` shows the children, or the failure that stopped them.
   */
  render() {
    const { error, componentStack } = this.state;
    if (!error) {
      return this.props.children;
    }

    return (
      <div className="yorkie-devtools-error">
        <p className="error-title">Yorkie Devtools stopped</p>
        <p className="error-desc">
          The panel could not render this document.
          <br />
          Try again, or reload the page it is inspecting.
        </p>
        <button
          type="button"
          className="retry-btn"
          onClick={() =>
            this.setState({ error: undefined, componentStack: '' })
          }
        >
          Try again
        </button>
        <details className="error-detail">
          <summary>Details</summary>
          <pre>
            {error.stack || `${error.name}: ${error.message}`}
            {componentStack}
          </pre>
        </details>
      </div>
    );
  }
}
