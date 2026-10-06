/*
 * Copyright 2020 The Yorkie Authors. All rights reserved.
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

export type UUID = string;

/**
 * `webCrypto` returns the ambient Web Crypto implementation, if the runtime
 * has one. Browsers and Node >= 19 expose it as `globalThis.crypto`; the
 * lookup is guarded so a runtime without it still loads this module, and it
 * is read per call so {@link hasStrongRandomSource} cannot disagree with what
 * {@link uuid} will actually draw from.
 */
function webCrypto(): Crypto | undefined {
  return typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;
}

/**
 * `hasStrongRandomSource` reports whether {@link uuid} draws from the
 * runtime's CSPRNG rather than the `Math.random` fallback. A caller that
 * needs a generated UUID to be unguessable -- not merely unique -- has to
 * check this before relying on it; see {@link randomBytes}.
 */
export function hasStrongRandomSource(): boolean {
  const crypto = webCrypto();
  return !!(crypto?.randomUUID || crypto?.getRandomValues);
}

const HEX: Array<string> = [];
for (let i = 0; i < 256; i++) {
  HEX.push((i + 0x100).toString(16).slice(1));
}

/**
 * `randomBytes` fills 16 bytes from the strongest source the runtime offers.
 *
 * `crypto.getRandomValues` is a CSPRNG and is what we want: the default value
 * of `ClientOptions.key` comes from {@link uuid}, and that key is an
 * identifier the server trusts verbatim — a predictable one lets another
 * client of the same project activate under the same derived actor. Only when
 * no Web Crypto is present at all do we fall back to `Math.random`, which is
 * *not* unguessable; such a runtime must pass its own `key` rather than rely
 * on the default.
 */
function randomBytes(): Uint8Array {
  const bytes = new Uint8Array(16);
  const crypto = webCrypto();
  if (crypto?.getRandomValues) {
    crypto.getRandomValues(bytes);
    return bytes;
  }
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = (Math.random() * 256) | 0;
  }
  return bytes;
}

/**
 * `uuid` generates a random (version 4) UUID string, using the runtime's
 * CSPRNG. See {@link randomBytes} for the fallback and why it matters.
 * @see http://www.ietf.org/rfc/rfc4122.txt
 */
export function uuid(): UUID {
  const crypto = webCrypto();
  if (crypto?.randomUUID) {
    return crypto.randomUUID();
  }

  const b = randomBytes();
  // Version 4 (random) and RFC 4122 variant bits.
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;

  return (
    HEX[b[0]] +
    HEX[b[1]] +
    HEX[b[2]] +
    HEX[b[3]] +
    '-' +
    HEX[b[4]] +
    HEX[b[5]] +
    '-' +
    HEX[b[6]] +
    HEX[b[7]] +
    '-' +
    HEX[b[8]] +
    HEX[b[9]] +
    '-' +
    HEX[b[10]] +
    HEX[b[11]] +
    HEX[b[12]] +
    HEX[b[13]] +
    HEX[b[14]] +
    HEX[b[15]]
  );
}
