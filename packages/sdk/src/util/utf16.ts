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

/**
 * `alignSplitOffset` moves a UTF-16 offset that falls between the two code
 * units of a surrogate pair forward to the end of that pair. Any other offset
 * is returned unchanged.
 *
 * A mid-pair offset names no character boundary. A JS string can hold the two
 * halves, so splitting there is silently possible here, but a Go string cannot
 * represent a lone surrogate: the server rewrites each half as U+FFFD and that
 * replica ends up holding text no other replica has. Both implementations
 * therefore move such a split to the same place.
 *
 * Forward rather than back, because an edit resolves the same anchor twice
 * (once for `from`, once for `to`) and only the forward boundary leaves the
 * second resolution on the boundary the first one created; moving back would
 * anchor `to` after the whole right piece and turn a caret edit into a
 * deletion of it.
 */
export function alignSplitOffset(value: string, offset: number): number {
  if (offset <= 0 || offset >= value.length) {
    return offset;
  }

  const lead = value.charCodeAt(offset - 1);
  const trail = value.charCodeAt(offset);
  const isMidPair =
    lead >= 0xd800 && lead <= 0xdbff && trail >= 0xdc00 && trail <= 0xdfff;

  return isMidPair ? offset + 1 : offset;
}
