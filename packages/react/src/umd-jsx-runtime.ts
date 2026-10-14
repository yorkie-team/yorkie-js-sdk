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

// The script-tag UMD build resolves `react/jsx-runtime` here. React's CDN
// builds expose only the `React` global, and bundling React's own runtime
// would tie the elements to one React major, so create them through
// `React.createElement` like the classic runtime does.
import React from 'react';

type Props = Record<string, unknown> & { children?: unknown };

/**
 * `jsx` creates an element whose children, if any, are a single child or a
 * dynamic array.
 */
export function jsx(type: React.ElementType, props: Props, key?: React.Key) {
  const { children, ...rest } = props;
  if (key !== undefined) rest.key = key;
  return children === undefined
    ? React.createElement(type, rest)
    : React.createElement(type, rest, children as React.ReactNode);
}

/**
 * `jsxs` creates an element whose children are a static array.
 */
export function jsxs(type: React.ElementType, props: Props, key?: React.Key) {
  const { children, ...rest } = props;
  if (key !== undefined) rest.key = key;
  return React.createElement(
    type,
    rest,
    ...(children as Array<React.ReactNode>),
  );
}

export const Fragment = React.Fragment;
