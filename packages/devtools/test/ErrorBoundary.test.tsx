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

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorBoundary } from '../src/devtools/components/ErrorBoundary';

const Boom = () => {
  throw new TypeError('Do not know how to serialize a BigInt');
};

describe('ErrorBoundary', () => {
  beforeEach(() => {
    // NOTE(chacha912): React reports a caught error through console.error too,
    // which would otherwise fill the test output.
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders its children while nothing throws', () => {
    render(
      <ErrorBoundary>
        <span>document tree</span>
      </ErrorBoundary>,
    );

    expect(screen.getByText('document tree')).toBeInTheDocument();
  });

  it('shows the failure instead of unmounting the panel', () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );

    expect(screen.getByText('Yorkie Devtools stopped')).toBeInTheDocument();
    expect(
      screen.getByText(/Do not know how to serialize a BigInt/),
    ).toBeInTheDocument();
  });

  it('renders the children again when the user retries', () => {
    let shouldThrow = true;
    const Flaky = () => {
      if (shouldThrow) {
        throw new Error('first render only');
      }
      return <span>document tree</span>;
    };

    render(
      <ErrorBoundary>
        <Flaky />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Yorkie Devtools stopped')).toBeInTheDocument();

    shouldThrow = false;
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(screen.getByText('document tree')).toBeInTheDocument();
    expect(screen.queryByText('Yorkie Devtools stopped')).toBeNull();
  });
});
