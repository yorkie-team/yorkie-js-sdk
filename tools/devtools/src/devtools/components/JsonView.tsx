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

import ReactJsonView from '@microlink/react-json-view';

export function JSONView({ src }) {
  return (
    <ReactJsonView
      src={src}
      iconStyle="square"
      enableClipboard={false}
      displayDataTypes={false}
      displayObjectSize={false}
      quotesOnKeys={false}
      displayArrayKey={false}
      name={false}
      theme={{
        base00: 'null',
        base01: 'null',
        base02: 'null',
        base03: 'null',
        base04: 'null',
        base05: 'null',
        base06: 'null',
        base07: '#c2bdba',
        base08: 'null',
        base09: 'null',
        base0A: 'null',
        base0B: 'null',
        base0C: 'null',
        base0D: '#c2bdba',
        base0E: '#c2bdba',
        base0F: 'null',
      }}
    />
  );
}
