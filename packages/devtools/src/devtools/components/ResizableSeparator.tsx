/*
 * Copyright 2024 The Yorkie Authors. All rights reserved.
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

import { useState } from 'react';
import classNames from 'classnames';

/**
 * Render a focusable separator bar with drag and focus styling.
 *
 * @param props.id - Element id and test-id (default: 'drag-bar').
 * @param props.dir - Orientation: 'horizontal' or 'vertical'.
 * @param props.isDragging - Whether the separator is being dragged.
 * @param props... - Additional props spread onto the root div.
 */
export function Separator({ id = 'drag-bar', dir, isDragging, ...props }: any) {
  const [isFocused, setIsFocused] = useState(false);

  return (
    <div
      id={id}
      data-testid={id}
      tabIndex={0}
      className={classNames(
        'separator',
        dir === 'horizontal' && 'separator-horizontal',
        (isDragging || isFocused) && 'separator-dragging',
      )}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
      {...props}
    />
  );
}
