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

// What the agent toolchain's install is allowed to be told.
//
// `pnpm install --frozen-lockfile --ignore-scripts --ignore-pnpmfile` runs no
// lifecycle script and no hook. It still does what `pnpm-lock.yaml`, the
// workspace file and the manifests tell it to: which registry package to
// fetch, and — for anything that is not a plain registry package — which
// other fetcher to use and with what arguments. Those files come from the
// branch. So before the install, this refuses every one of them that is not
// of exactly the shape this repository's own files have:
//
//   - every locked package is a registry package: its `resolution` is
//     `{integrity: sha512-…}` and nothing else (one exception, below);
//   - every dependency specifier, in the lockfile and in the manifests, is a
//     registry range or `workspace:`; a `link:` leads to a project of this
//     workspace;
//   - no file uses a key this repository's files do not use.
//
// AN ALLOW-LIST, AND A STRICT READER. The lockfile and the workspace file are
// YAML, and YAML can spell one document many ways. This does not try to
// understand them all: it reads only the plain block style pnpm itself writes
// — one `key: value` per line, two-space indentation, single-quoted or plain
// scalars, and one-line `{…}` / `[…]` where pnpm writes them — and refuses
// any line that is anything else (double quotes, anchors, aliases, tags,
// merge keys, block scalars, multi-line values, duplicate keys). What is not
// fully understood is refused.
//
// Usage. Inside the container, by `entry.sh`:
//   node check-install-inputs.mjs before    <workspace root>
//   node check-install-inputs.mjs installed <workspace root>
// On the runner, around the container, with a scrubbed environment:
//   node check-install-inputs.mjs snapshot <workspace root> <file> <runner temp> <exclude> <home>
//   node check-install-inputs.mjs after    <workspace root> <file> <runner temp> <exclude> <home>
//
// THIS IS THE SECOND LAYER, AND THE TRIPWIRE. The first layer is the
// container itself (see action.yml): it can write nowhere but the
// workspace's own files, whatever is in them. `before` and `installed` are
// the allow-list, and read the branch's files — which is why they run inside
// the container. `snapshot` and `after` run on the runner and read only
// names, kinds and link targets in the workspace, never following a link.
//
// It imports nothing but Node's own modules.

import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { TextDecoder } from 'node:util';

// WHERE A PATH PHYSICALLY IS is the kernel's answer: each component followed
// in turn, a `..` taken from wherever the components before it led. Node's
// default `realpathSync` joins a link's target to its directory as text
// first, which settles a `..` before the component in front of it has been
// followed; when that component is itself a link, the two answers are
// different places. Every judgement below of where something is uses this.
const physical = (p) => realpathSync.native(p);

/** Thrown for anything refused; the message is what the step prints. */
export class Refusal extends Error {}
const refuse = (message) => {
  throw new Refusal(message);
};

// EVERY NAME IS READ AS ITS BYTES, and is valid UTF-8 or refused. Node
// decodes a name it lists as UTF-8 and puts U+FFFD where the bytes are not;
// a path built from that name and handed back to the filesystem is encoded
// again, and names a different entry, or none. So a name, or a link's
// target, is read as bytes, decoded strictly, and must encode back to exactly
// the same bytes — a leading byte-order mark included — or the walk stops.
// A name that holds U+FFFD as real, valid bytes is an ordinary name.
const STRICT_UTF8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
const printable = (bytes) =>
  [...bytes]
    .map((b) =>
      b >= 0x20 && b < 0x7f && b !== 0x5c
        ? String.fromCharCode(b)
        : `\\x${b.toString(16).padStart(2, '0')}`,
    )
    .join('');
function strictName(bytes, what) {
  let text = null;
  try {
    text = STRICT_UTF8.decode(bytes);
  } catch {
    // Not UTF-8: refused below.
  }
  if (text === null || !Buffer.from(text, 'utf8').equals(bytes)) {
    refuse(`${what(printable(bytes))} is not valid UTF-8`);
  }
  return text;
}
/** The entries of `dir`, each with a name that is exactly its bytes. */
function listDir(dir) {
  return readdirSync(dir, { withFileTypes: true, encoding: 'buffer' }).map(
    (e) => ({
      name: strictName(e.name, (n) => `the name ${path.join(dir, n)}`),
      isDirectory: () => e.isDirectory(),
      isSymbolicLink: () => e.isSymbolicLink(),
    }),
  );
}
/** A link's target, exactly as its bytes say. */
const linkText = (full) =>
  strictName(
    readlinkSync(full, { encoding: 'buffer' }),
    (t) => `the target of ${full} (${t})`,
  );

// --- the strict reader ----------------------------------------------------------

// A key as pnpm writes one: a package name, a path, a range (`a@>=1 <2`), a
// snapshot id (`a@1.0.0(b@2.0.0)`). It may not start with a character YAML
// gives a meaning to, and holds no quote, colon, comma, brace or bracket.
const KEY_BODY = /^[A-Za-z0-9@_.][A-Za-z0-9@_./+~^<>=|()* -]*$/;
// A plain (unquoted) value: starts like a word or a version and holds no
// `: ` or ` #`, which would end it early for a YAML parser.
const PLAIN_START = /^[A-Za-z0-9^~_.]/;
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0009\u000b-\u001f\u007f\u0085\u2028\u2029\ufeff]/;

function scalar(text, where) {
  if (text.startsWith("'")) {
    if (!/^'[^']*'$/.test(text)) {
      refuse(`${where}: a quoted value that is not one plain '…' string`);
    }
    return text.slice(1, -1);
  }
  if (
    !PLAIN_START.test(text) ||
    text.includes(': ') ||
    text.includes(' #') ||
    /[:\s]$/.test(text)
  ) {
    refuse(`${where}: a value that is not a plain or single-quoted scalar`);
  }
  return text;
}

function key(text, where) {
  const body = /^'[^']*'$/.test(text) ? text.slice(1, -1) : text;
  if (!KEY_BODY.test(body) || / $/.test(body) || body.includes(': ')) {
    refuse(`${where}: a key that is not a plain or single-quoted name`);
  }
  if (body === '__proto__') refuse(`${where}: a reserved key`);
  return body;
}

/** `{}`, or `{a: b, c: 'd'}` on one line, with simple words as keys. */
function flowMap(text, where) {
  const out = new Map();
  const inner = text.slice(1, -1);
  if (inner === '') return out;
  for (const part of inner.split(', ')) {
    const m = /^([A-Za-z][A-Za-z0-9]*): (.+)$/.exec(part);
    if (!m) refuse(`${where}: a one-line mapping that is not {key: value, …}`);
    if (out.has(m[1])) refuse(`${where}: a repeated key`);
    out.set(m[1], scalar(m[2], where));
  }
  return out;
}

/** `[a, b]` on one line, of simple words. */
function flowSeq(text, where) {
  const inner = text.slice(1, -1);
  if (!/^[A-Za-z0-9_!-]+(, [A-Za-z0-9_!-]+)*$/.test(inner)) {
    refuse(`${where}: a one-line list that is not [word, …]`);
  }
  return inner.split(', ');
}

/**
 * Read `text` as the block-style YAML pnpm writes, or refuse. Mappings come
 * back as `Map`s, lists as arrays, every scalar as the string it was written
 * as. `file` names the document in messages.
 */
export function readStrictYaml(text, file) {
  if (CONTROL.test(text)) {
    refuse(`${file}: a tab, a carriage return or a control character`);
  }
  const root = new Map();
  // The open containers, innermost last: `indent` is where their entries sit.
  const stack = [{ indent: 0, node: root }];
  // A `key:` with nothing after it, waiting to learn what it holds.
  let pending = null;
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    const where = `${file}:${i + 1}`;
    if (line === '' || /^ *#/.test(line)) return;
    if (/ $/.test(line)) refuse(`${where}: trailing space`);
    const indent = /^ */.exec(line)[0].length;
    const body = line.slice(indent);
    if (indent % 2 !== 0) refuse(`${where}: indentation that is not in twos`);

    if (pending) {
      if (indent === pending.indent + 2) {
        const node = body.startsWith('- ') ? [] : new Map();
        pending.parent.set(pending.key, node);
        stack.push({ indent, node });
        pending = null;
      } else {
        refuse(`${where}: \`${pending.key}:\` has no value`);
      }
    }
    while (stack.length > 1 && stack.at(-1).indent > indent) stack.pop();
    const top = stack.at(-1);
    if (top.indent !== indent) refuse(`${where}: unexpected indentation`);

    if (Array.isArray(top.node)) {
      if (!body.startsWith('- ')) refuse(`${where}: expected a list item`);
      top.node.push(scalar(body.slice(2), where));
      return;
    }
    if (body.startsWith('- ')) refuse(`${where}: a list item in a mapping`);

    // `key:`, `key: value` — the key ends at the first `: ` or a final `:`.
    let name;
    let rest;
    if (body.startsWith("'")) {
      const m = /^('[^']*'):(?: (.*))?$/.exec(body);
      if (!m) refuse(`${where}: not a \`key: value\` line`);
      [, name, rest] = m;
    } else {
      const at = body.indexOf(': ');
      if (at >= 0) {
        name = body.slice(0, at);
        rest = body.slice(at + 2);
      } else if (body.endsWith(':')) {
        name = body.slice(0, -1);
      } else {
        refuse(`${where}: not a \`key: value\` line`);
      }
    }
    const k = key(name, where);
    if (top.node.has(k)) refuse(`${where}: a repeated key`);
    if (rest === undefined) {
      pending = { indent, key: k, parent: top.node };
    } else if (rest.startsWith('{') && rest.endsWith('}')) {
      top.node.set(k, flowMap(rest, where));
    } else if (rest.startsWith('[') && rest.endsWith(']')) {
      top.node.set(k, flowSeq(rest, where));
    } else {
      top.node.set(k, scalar(rest, where));
    }
  });
  if (pending) refuse(`${file}: \`${pending.key}:\` has no value`);
  return root;
}

// --- what a value may be ----------------------------------------------------------

const NAME =
  /^(@[A-Za-z0-9][A-Za-z0-9._~-]*\/)?[A-Za-z0-9_~-][A-Za-z0-9._~-]*$/;
const VERSION = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/;
// A version as a lockfile refers to one: with the peers it was resolved
// against in parentheses, or as `name@version` for an aliased package.
const PEERS = /^(\([A-Za-z0-9@._~/()+-]+\))*$/;
// A semver range, as a registry dependency is written.
const RANGE = /^[A-Za-z0-9 .<>=^~|*+-]+$/;
const INTEGRITY = /^sha512-[A-Za-z0-9+/]{86}==$/;

// THE ONE RESOLUTION THAT IS NOT AN INTEGRITY HASH. The `@buf` scope is
// served by buf.build's registry (the trusted `.npmrc` names it), which
// builds its packages on request and publishes no integrity hash for them,
// so pnpm records the tarball's address instead. Allowed for that scope, on
// that registry, at that path, and nowhere else.
const BUF_REGISTRY = 'https://buf.build/gen/npm/v1/';
const BUF_NAME = /^@buf\/[A-Za-z0-9_-][A-Za-z0-9._-]*$/;
const BUF_FILE = /^[A-Za-z0-9_-][A-Za-z0-9._-]*\.tgz$/;

const isMap = (v) => v instanceof Map;
const isString = (v) => typeof v === 'string';

/** Is this a dependency specifier that names a registry package? */
function registrySpecifier(spec) {
  if (!isString(spec) || spec === '') return false;
  if (RANGE.test(spec)) return true;
  // An alias: `npm:name@range`.
  const alias = /^npm:(.+)@([^@]+)$/.exec(spec);
  return alias !== null && NAME.test(alias[1]) && RANGE.test(alias[2]);
}
/** `workspace:` and a range — never a path. */
const workspaceSpecifier = (spec) =>
  isString(spec) && /^workspace:[A-Za-z0-9 .<>=^~|*+-]+$/.test(spec);

function lockedVersion(value) {
  const m = /^([^()]+)(.*)$/.exec(value);
  if (!m || !PEERS.test(m[2])) return false;
  if (VERSION.test(m[1])) return true;
  const at = m[1].lastIndexOf('@');
  return (
    at > 0 && NAME.test(m[1].slice(0, at)) && VERSION.test(m[1].slice(at + 1))
  );
}

function only(map, allowed, where) {
  if (!isMap(map)) refuse(`${where}: expected a mapping`);
  for (const k of map.keys()) {
    if (!allowed.includes(k)) refuse(`${where}: \`${k}\` is not allowed here`);
  }
}

/** A project path as the lockfile names one: `.` or a plain path under the root. */
function projectPath(p) {
  return (
    p === '.' ||
    (/^[A-Za-z0-9@_][A-Za-z0-9@_./-]*$/.test(p) &&
      !p.split('/').some((s) => s === '' || s === '.' || s === '..'))
  );
}

// --- the lockfile -------------------------------------------------------------------

const DEP_FIELDS = ['dependencies', 'devDependencies', 'optionalDependencies'];

/**
 * Check a parsed `pnpm-lock.yaml`. Returns the project paths it installs for.
 */
export function checkLockfile(lock) {
  const F = 'pnpm-lock.yaml';
  only(
    lock,
    [
      'lockfileVersion',
      'settings',
      'overrides',
      'importers',
      'packages',
      'snapshots',
    ],
    F,
  );
  if (lock.get('lockfileVersion') !== '9.0') {
    refuse(`${F}: lockfileVersion is not '9.0'`);
  }
  const settings = lock.get('settings') ?? new Map();
  only(
    settings,
    ['autoInstallPeers', 'excludeLinksFromLockfile'],
    `${F} settings`,
  );
  for (const v of settings.values()) {
    if (v !== 'true' && v !== 'false') refuse(`${F} settings: not a boolean`);
  }
  const overrides = lock.get('overrides') ?? new Map();
  only(overrides, [...overrides.keys()], `${F} overrides`);
  for (const [k, v] of overrides) {
    if (!registrySpecifier(v)) {
      refuse(
        `${F} overrides: \`${k}\` is not overridden with a registry range`,
      );
    }
  }

  const importers = lock.get('importers');
  if (!isMap(importers) || importers.size === 0) {
    refuse(`${F}: lists no importers`);
  }
  for (const p of importers.keys()) {
    if (!projectPath(p)) {
      refuse(
        `${F}: names a project that is not a plain path under the workspace root: ${p}`,
      );
    }
  }
  for (const [p, importer] of importers) {
    const where = `${F} importer ${p}`;
    only(importer, DEP_FIELDS, where);
    for (const field of DEP_FIELDS) {
      const deps = importer.get(field) ?? new Map();
      if (!isMap(deps)) refuse(`${where}: ${field} is not a mapping`);
      for (const [name, entry] of deps) {
        const at = `${where}: ${name}`;
        if (!NAME.test(name)) refuse(`${at} is not a package name`);
        only(entry, ['specifier', 'version'], at);
        const spec = entry.get('specifier');
        const version = entry.get('version');
        if (!isString(version)) refuse(`${at} has no version`);
        if (version.startsWith('link:')) {
          // A link leads to another project of this workspace, and is asked
          // for as one.
          const target = path.posix.normalize(
            path.posix.join(p, version.slice('link:'.length)),
          );
          if (!importers.has(target) || target === p) {
            refuse(
              `${at} links to something that is not a project of this workspace`,
            );
          }
          if (!workspaceSpecifier(spec)) {
            refuse(`${at} is linked but not asked for as \`workspace:\``);
          }
        } else {
          if (!lockedVersion(version)) {
            refuse(
              `${at} is locked to something that is not a registry version`,
            );
          }
          if (!registrySpecifier(spec)) {
            refuse(`${at} is not asked for from the registry`);
          }
        }
      }
    }
  }

  const packages = lock.get('packages') ?? new Map();
  if (!isMap(packages)) refuse(`${F}: packages is not a mapping`);
  for (const [id, pkg] of packages) {
    const where = `${F} package ${id}`;
    const at = id.lastIndexOf('@');
    const name = id.slice(0, at);
    if (at <= 0 || !NAME.test(name) || !VERSION.test(id.slice(at + 1))) {
      refuse(`${where}: not a registry package \`name@version\``);
    }
    only(
      pkg,
      [
        'resolution',
        'engines',
        'cpu',
        'os',
        'libc',
        'hasBin',
        'deprecated',
        'peerDependencies',
        'peerDependenciesMeta',
        'bundledDependencies',
      ],
      where,
    );
    // THE RESOLUTION, EXACTLY. One key. Anything else — a `type`, a `repo`,
    // a `commit`, a `directory`, a `path`, a `tarball` of any other kind —
    // selects a fetcher other than the registry's.
    const resolution = pkg.get('resolution');
    if (!isMap(resolution) || resolution.size !== 1) {
      refuse(
        `${where}: its resolution is not exactly one of the allowed shapes`,
      );
    }
    const [[kind, value]] = [...resolution];
    const integrity = kind === 'integrity' && INTEGRITY.test(value);
    // The address is the registry, the package's own name, `/-/` and one
    // file name: nothing in it is free but that file name.
    const own = `${BUF_REGISTRY}${name}/-/`;
    const buf =
      kind === 'tarball' &&
      BUF_NAME.test(name) &&
      value.startsWith(own) &&
      BUF_FILE.test(value.slice(own.length));
    if (!integrity && !buf) {
      refuse(
        `${where}: its resolution is not exactly one of the allowed shapes`,
      );
    }
    for (const field of ['engines', 'peerDependencies']) {
      const m = pkg.get(field) ?? new Map();
      if (!isMap(m)) refuse(`${where}: ${field} is not a mapping`);
      for (const v of m.values()) {
        if (
          !isString(v) ||
          !/^[A-Za-z0-9 .<>=^~|*+:-]+$/.test(v) ||
          v.includes('//')
        ) {
          refuse(`${where}: ${field} holds something that is not a range`);
        }
      }
    }
    const meta = pkg.get('peerDependenciesMeta') ?? new Map();
    if (!isMap(meta)) refuse(`${where}: peerDependenciesMeta is not a mapping`);
    for (const m of meta.values()) {
      only(m, ['optional'], where);
    }
    for (const field of ['cpu', 'os', 'libc', 'bundledDependencies']) {
      const list = pkg.get(field) ?? [];
      if (!Array.isArray(list)) refuse(`${where}: ${field} is not a list`);
    }
    if (!['true', 'false', undefined].includes(pkg.get('hasBin'))) {
      refuse(`${where}: hasBin is not a boolean`);
    }
    // `deprecated` is the registry's free text; nothing reads it as a path.
    if (pkg.has('deprecated') && !isString(pkg.get('deprecated'))) {
      refuse(`${where}: deprecated is not text`);
    }
  }

  const snapshots = lock.get('snapshots') ?? new Map();
  if (!isMap(snapshots)) refuse(`${F}: snapshots is not a mapping`);
  for (const [id, snap] of snapshots) {
    const where = `${F} snapshot ${id}`;
    const m = /^([^()]+)(.*)$/.exec(id);
    if (!m || !PEERS.test(m[2]) || !packages.has(m[1])) {
      refuse(`${where}: not a snapshot of a package this lockfile locks`);
    }
    only(
      snap,
      [
        'dependencies',
        'optionalDependencies',
        'transitivePeerDependencies',
        'optional',
      ],
      where,
    );
    for (const field of ['dependencies', 'optionalDependencies']) {
      const deps = snap.get(field) ?? new Map();
      if (!isMap(deps)) refuse(`${where}: ${field} is not a mapping`);
      for (const [name, version] of deps) {
        if (!NAME.test(name) || !isString(version) || !lockedVersion(version)) {
          refuse(`${where}: ${name} is not a registry version`);
        }
      }
    }
    const peers = snap.get('transitivePeerDependencies') ?? [];
    if (!Array.isArray(peers))
      refuse(`${where}: transitivePeerDependencies is not a list`);
    if (!['true', 'false', undefined].includes(snap.get('optional'))) {
      refuse(`${where}: optional is not a boolean`);
    }
  }
  return [...importers.keys()];
}

// --- the workspace file ---------------------------------------------------------------

export function checkWorkspaceFile(ws) {
  const F = 'pnpm-workspace.yaml';
  // `packages` is the only key this major reads; `publicHoistPattern` is the
  // other one this repository's file has. A later major reads settings here,
  // which is why any other key is refused rather than ignored.
  only(ws, ['packages', 'publicHoistPattern'], F);
  const globs = ws.get('packages');
  if (!Array.isArray(globs) || globs.length === 0) {
    refuse(`${F}: lists no packages`);
  }
  for (const glob of globs) {
    if (
      !/^!?[A-Za-z0-9@_*][A-Za-z0-9@_.*/-]*$/.test(glob) ||
      glob.includes('..') ||
      glob.includes('//')
    ) {
      refuse(
        `${F} names a path outside the workspace root, or a pattern that is not a plain glob: ${glob}`,
      );
    }
  }
  const hoist = ws.get('publicHoistPattern') ?? [];
  if (!Array.isArray(hoist)) refuse(`${F}: publicHoistPattern is not a list`);
  for (const pattern of hoist) {
    if (!/^[A-Za-z0-9@_*!.-]+$/.test(pattern)) {
      refuse(
        `${F}: publicHoistPattern holds something that is not a name pattern`,
      );
    }
  }
}

// --- the manifests ----------------------------------------------------------------------

const MANIFEST_DEP_FIELDS = [...DEP_FIELDS, 'peerDependencies'];

// EVERY TOP-LEVEL KEY A MANIFEST MAY HAVE. An install reads more of a
// `package.json` than its dependencies — a name becomes a directory, a `bin`
// entry becomes a file — so a key is allowed only when it is on this list,
// and the ones an install acts on are checked below. The list is the keys
// this repository's manifests use, plus a few that describe a package and
// that no install reads. Anything else is refused: a key that is not known
// to be inert is not assumed to be.
const INERT_KEYS = [
  // What the package is and how it is published. Read by people, bundlers
  // and `npm publish`, not by an install.
  'private',
  'type',
  'description',
  'main',
  'module',
  'types',
  'typings',
  'exports',
  'browser',
  'unpkg',
  'jsdelivr',
  'sideEffects',
  'files',
  'author',
  'contributors',
  'license',
  'homepage',
  'keywords',
  'repository',
  'bugs',
  'funding',
  // The browser extension's own fields (packages/devtools).
  'displayName',
  'manifest',
];
const CHECKED_KEYS = [
  'name',
  'version',
  'scripts',
  'engines',
  'bin',
  'publishConfig',
  'pnpm',
  ...MANIFEST_DEP_FIELDS,
];
const PUBLISH_CONFIG_KEYS = [
  'access',
  'tag',
  'main',
  'module',
  'types',
  'typings',
  'exports',
  'browser',
  'unpkg',
  'jsdelivr',
];
// A command name: what a `bin` entry is called on disk. One path segment.
const BIN_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]*$/;

const isObject = (v) =>
  v !== null && typeof v === 'object' && !Array.isArray(v);
/** A path inside its own package: relative, and never climbing. */
const inPackagePath = (p) =>
  isString(p) &&
  /^(\.\/)?[A-Za-z0-9@_-][A-Za-z0-9@_./-]*$/.test(p) &&
  !p.split('/').some((s) => s === '..' || s === '');

/** Check one project's parsed `package.json`. `isRoot`: the workspace root's. */
export function checkManifest(manifest, file, isRoot) {
  if (!isObject(manifest)) refuse(`${file}: not a JSON object`);
  const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  for (const k of Object.keys(manifest)) {
    if (!INERT_KEYS.includes(k) && !CHECKED_KEYS.includes(k)) {
      refuse(`${file}: \`${k}\` is not a key a manifest may have here`);
    }
  }
  // A NAME BECOMES A DIRECTORY and a version part of one, so both are plain.
  if (
    own(manifest, 'name') &&
    !(isString(manifest.name) && NAME.test(manifest.name))
  ) {
    refuse(`${file}: name is not a package name`);
  }
  if (
    own(manifest, 'version') &&
    !(isString(manifest.version) && VERSION.test(manifest.version))
  ) {
    refuse(`${file}: version is not a version`);
  }
  for (const field of ['scripts', 'engines']) {
    if (!own(manifest, field)) continue;
    if (
      !isObject(manifest[field]) ||
      !Object.values(manifest[field]).every(isString)
    ) {
      refuse(`${file}: ${field} is not an object of strings`);
    }
  }
  // A `bin` ENTRY BECOMES A FILE, named after its key, wherever the package
  // is linked. The key is one plain path segment — no scope, no separator —
  // and the value a path inside the package.
  if (own(manifest, 'bin')) {
    const { bin } = manifest;
    const entries = isString(bin)
      ? [
          [
            own(manifest, 'name')
              ? String(manifest.name).replace(/^@[^/]*\//, '')
              : '',
            bin,
          ],
        ]
      : isObject(bin)
        ? Object.entries(bin)
        : refuse(`${file}: bin is not a string or an object`);
    for (const [name, target] of entries) {
      if (!BIN_NAME.test(name)) {
        refuse(`${file}: bin names a command that is not one plain name`);
      }
      if (!inPackagePath(target)) {
        refuse(`${file}: bin \`${name}\` is not a path inside the package`);
      }
    }
  }
  for (const field of MANIFEST_DEP_FIELDS) {
    if (!own(manifest, field)) continue;
    const deps = manifest[field];
    if (!isObject(deps)) refuse(`${file}: ${field} is not an object`);
    for (const [name, spec] of Object.entries(deps)) {
      // The key is what the dependency is called in `node_modules`.
      if (!NAME.test(name)) refuse(`${file}: ${field} names \`${name}\``);
      if (!registrySpecifier(spec) && !workspaceSpecifier(spec)) {
        refuse(
          `${file}: ${name} is not asked for from the registry or the workspace`,
        );
      }
    }
  }
  if (own(manifest, 'publishConfig')) {
    const pc = manifest.publishConfig;
    if (!isObject(pc)) refuse(`${file}: publishConfig is not an object`);
    for (const k of Object.keys(pc)) {
      if (!PUBLISH_CONFIG_KEYS.includes(k)) {
        refuse(`${file}: publishConfig.${k} is not allowed`);
      }
    }
  }
  if (own(manifest, 'pnpm')) {
    // Only the root's is read for an install, and only `overrides` is used
    // here. Every other key (patches, extensions, build lists, a runtime to
    // download) is refused.
    if (!isRoot) refuse(`${file}: a \`pnpm\` field outside the root manifest`);
    const cfg = manifest.pnpm;
    if (!isObject(cfg)) refuse(`${file}: pnpm is not an object`);
    for (const k of Object.keys(cfg)) {
      if (k !== 'overrides') refuse(`${file}: pnpm.${k} is not allowed`);
    }
    const overrides = cfg.overrides ?? {};
    if (!isObject(overrides))
      refuse(`${file}: pnpm.overrides is not an object`);
    for (const [k, v] of Object.entries(overrides)) {
      if (!registrySpecifier(v)) {
        refuse(`${file}: pnpm.overrides \`${k}\` is not a registry range`);
      }
    }
  }
}

// --- the tree ---------------------------------------------------------------------------

function regularFile(file, label) {
  let st;
  try {
    st = lstatSync(file);
  } catch {
    refuse(`${label} is missing`);
  }
  if (!st.isFile()) refuse(`${label} is not a regular file`);
  return readFileSync(file, 'utf8');
}

/** Every directory under `root` that is not `.git`, depth first. */
function* directories(root, rel = '') {
  yield rel;
  for (const e of listDir(path.join(root, rel))) {
    if (!e.isDirectory() || e.name === '.git' || e.name === 'node_modules')
      continue;
    yield* directories(root, rel === '' ? e.name : `${rel}/${e.name}`);
  }
}

/** Does `glob` (pnpm-workspace `packages` syntax, as allowed above) match `dir`? */
function globMatches(glob, dir) {
  const re = glob
    .split('/')
    .map((seg) =>
      seg === '**'
        ? '(?:[^/]+/)*[^/]+'
        : seg.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*'),
    )
    .join('/');
  return new RegExp(`^${re}$`).test(dir);
}

/**
 * Where a symbolic link leads, judged BY ITS TEXT: never by asking the
 * filesystem to follow it, because the answer depends on who asks — a path
 * through a process's own view of the filesystem resolves one way in the
 * container and another for a later step on the runner. Returns why the link
 * is refused, or '' when it stays among the workspace's own files:
 *
 *   - an absolute target must be, once normalised, under the workspace root;
 *   - no target may pass through /proc, /dev or /sys;
 *   - a relative target, resolved from the link's own directory, must stay
 *     under the root;
 *   - and none may lead into `.git`, a trusted checkout or `temp`.
 *
 * Reading a target as text is only sound while no component it passes
 * through is itself a link; `linkStrays` covers the ones that do.
 */
export function linkLeaves(real, full, target, temp = null) {
  const under = (p, dir) => p === dir || p.startsWith(`${dir}${path.sep}`);
  const lexical = path.resolve(path.dirname(full), target);
  if (
    target
      .split('/')
      .some((part) => part === 'proc' || part === 'dev' || part === 'sys') &&
    path.isAbsolute(target)
  ) {
    return 'through the system';
  }
  if (!under(lexical, real)) return 'out of the workspace';
  const first = path.relative(real, lexical).split(path.sep)[0];
  if (first === '.git' || first.startsWith('.trusted-')) {
    return 'into .git or a trusted checkout';
  }
  if (temp !== null && under(lexical, temp))
    return "into the runner's temp directory";
  return '';
}

/**
 * The same judgement, for a target that passes THROUGH other links. A `..`
 * read as text steps back from the name before it; followed, it steps back
 * from wherever that name led. So the target is walked one component at a
 * time from the link's own directory, each component examined without
 * following it, and a component that is a link is walked the same way, by
 * its own text, before the next one is taken. Nothing is normalised ahead of
 * what precedes it. Returns why the link is refused, or '':
 *
 *   - every link met on the way passes `linkLeaves` by its own text;
 *   - an absolute target starts, as written, with the workspace root;
 *   - no step leaves the root, and none enters `.git`, a trusted checkout or
 *     `temp`, even to come back;
 *   - a component that cannot be examined, or that is not a directory where
 *     the target goes on through it, is a refusal;
 *   - a component that does not exist is a refusal, unless `missingAllowed`:
 *     then the rest is read as names below it, and may not hold a `..`.
 *
 * `full` is the link's path under `real`, with no link among its own
 * directories — which is how both walks below reach one.
 */
export function linkStrays(
  real,
  full,
  target,
  temp = null,
  missingAllowed = false,
) {
  const under = (p, dir) => p === dir || p.startsWith(`${dir}${path.sep}`);
  const NOT_A_DIRECTORY = 'through something that is not a directory';
  let links = 0;
  const follow = (link, text) => {
    const why = linkLeaves(real, link, text, temp);
    if (why !== '') refuse(why);
    let at = path.dirname(link);
    let parts = text.split('/');
    if (path.isAbsolute(text)) {
      if (!under(text, real)) refuse('out of the workspace');
      at = real;
      parts = text.slice(real.length).split('/');
    }
    // `at` is a place under the root with no link left in it. `isDir`: the
    // walk may go on through it. `missing`: nothing is there to examine.
    let isDir = true;
    let missing = false;
    for (const part of parts) {
      if (!isDir && !missing) refuse(NOT_A_DIRECTORY);
      if (part === '' || part === '.') continue;
      if (part === '..') {
        if (missing) refuse('through a path that does not exist');
        if (at === real) refuse('out of the workspace');
        at = path.dirname(at);
        continue;
      }
      const next = path.join(at, part);
      // Names are compared as the filesystem may: without regard to case.
      const first = path.relative(real, next).split(path.sep)[0].toLowerCase();
      if (first === '.git' || first.startsWith('.trusted-')) {
        refuse('into .git or a trusted checkout');
      }
      if (temp !== null && under(next, temp)) {
        refuse("into the runner's temp directory");
      }
      if (missing) {
        at = next;
        continue;
      }
      let st;
      try {
        st = lstatSync(next);
      } catch (err) {
        if (err.code !== 'ENOENT') {
          refuse('through a path that cannot be examined');
        }
        if (!missingAllowed) refuse('nowhere');
        missing = true;
        at = next;
        continue;
      }
      if (st.isSymbolicLink()) {
        if (++links > 40) refuse('through too many links');
        let inner;
        try {
          inner = linkText(next);
        } catch (err) {
          if (err instanceof Refusal) throw err;
          refuse('through a path that cannot be examined');
        }
        ({ at, isDir, missing } = follow(next, inner));
      } else {
        at = next;
        isDir = st.isDirectory();
      }
    }
    return { at, isDir, missing };
  };
  try {
    follow(full, target);
  } catch (err) {
    if (err instanceof Refusal) return err.message;
    throw err;
  }
  return '';
}

/**
 * THE SHAPE OF THE TREE, before the install. Walked without following a link.
 * A fresh checkout of this repository has no `node_modules`, no `.npmrc` but
 * the root's, no `.git` below the root and no symbolic link at all; a tree
 * that has one of the first three was shaped to be installed into, and a link
 * must at least stay among the workspace's own files: by its text, by where
 * it resolves, and by every link its target passes through.
 */
export function checkTree(root) {
  const real = physical(root);
  const inside = (p) => p === real || p.startsWith(`${real}${path.sep}`);
  const reserved = (p) => {
    const first = path.relative(real, p).split(path.sep)[0];
    return first === '.git' || first.startsWith('.trusted-');
  };
  const visit = (rel) => {
    for (const e of listDir(path.join(real, rel))) {
      const r = rel === '' ? e.name : `${rel}/${e.name}`;
      const full = path.join(real, r);
      if (rel === '' && (e.name === '.git' || e.name.startsWith('.trusted-'))) {
        if (e.isSymbolicLink()) refuse(`${r} is a symbolic link`);
        continue;
      }
      if (e.name === 'node_modules') {
        refuse(
          e.isSymbolicLink()
            ? `${r} is a symbolic link; the install refuses a symlinked node_modules`
            : `${r} exists before the install; the install refuses a checkout that brings its own node_modules`,
        );
      }
      if (e.name === '.git') refuse(`${r}: a .git below the workspace root`);
      if (e.name === '.npmrc' && rel !== '') {
        refuse(`${r}: a .npmrc that is not the workspace root's`);
      }
      if (e.isSymbolicLink()) {
        const text = linkText(full);
        const why = linkLeaves(real, full, text);
        if (why !== '') {
          refuse(`${r} is a symbolic link that leads ${why}`);
        }
        let target;
        try {
          target = physical(full);
        } catch {
          refuse(`${r} is a symbolic link that does not resolve`);
        }
        if (!inside(target)) {
          refuse(`${r} is a symbolic link that resolves outside the workspace`);
        }
        if (reserved(target)) {
          refuse(`${r} is a symbolic link into .git or a trusted checkout`);
        }
        const strays = linkStrays(real, full, text);
        if (strays !== '') {
          refuse(`${r} is a symbolic link that leads ${strays}`);
        }
      } else if (e.isDirectory()) {
        visit(r);
      }
    }
  };
  visit('');
}

/** Before the install: the shape of the tree, and everything it is told. */
export function checkBefore(root) {
  checkTree(root);
  return checkInputs(root);
}

/** Read and check everything the install reads from the tree at `root`. */
export function checkInputs(root) {
  const lock = readStrictYaml(
    regularFile(path.join(root, 'pnpm-lock.yaml'), 'pnpm-lock.yaml'),
    'pnpm-lock.yaml',
  );
  const importers = checkLockfile(lock);
  const ws = readStrictYaml(
    regularFile(path.join(root, 'pnpm-workspace.yaml'), 'pnpm-workspace.yaml'),
    'pnpm-workspace.yaml',
  );
  checkWorkspaceFile(ws);

  // A manifest is `package.json`. The other two spellings a package manager
  // accepts are not used here, and would not be read by the checks below.
  const globs = ws.get('packages');
  const positive = globs.filter((g) => !g.startsWith('!'));
  const negative = globs
    .filter((g) => g.startsWith('!'))
    .map((g) => g.slice(1));
  for (const dir of directories(root)) {
    for (const other of ['package.json5', 'package.yaml']) {
      if (existsSync(path.join(root, dir, other))) {
        refuse(
          `${dir === '' ? '' : `${dir}/`}${other}: a manifest that is not package.json`,
        );
      }
    }
    // THE PROJECTS ARE THE LOCKFILE'S. A directory the workspace file makes
    // a project of, that the lockfile does not install for, is one this
    // check has not read.
    if (
      dir !== '' &&
      !importers.includes(dir) &&
      existsSync(path.join(root, dir, 'package.json')) &&
      positive.some((g) => globMatches(g, dir)) &&
      !negative.some((g) => globMatches(g, dir) || globMatches(`${g}/**`, dir))
    ) {
      refuse(`${dir} is a workspace project the lockfile does not list`);
    }
  }
  for (const p of importers) {
    const file = p === '.' ? 'package.json' : `${p}/package.json`;
    let manifest;
    try {
      manifest = JSON.parse(regularFile(path.join(root, file), file));
    } catch (err) {
      if (err instanceof Refusal) throw err;
      refuse(`${file}: not JSON`);
    }
    checkManifest(manifest, file, p === '.');
  }
  return importers;
}

/**
 * After the install: every project it installed for, and every entry it
 * placed directly in a project's `node_modules`, is inside the workspace.
 */
export function checkInstalled(root) {
  const real = physical(root);
  const inside = (p) => p === real || p.startsWith(`${real}${path.sep}`);
  const lock = readStrictYaml(
    regularFile(path.join(root, 'pnpm-lock.yaml'), 'pnpm-lock.yaml'),
    'pnpm-lock.yaml',
  );
  for (const p of checkLockfile(lock)) {
    const dir = path.join(root, p);
    for (const d of [dir, path.join(dir, 'node_modules')]) {
      if (!existsSync(d)) continue;
      if (lstatSync(d).isSymbolicLink()) {
        refuse(
          `${path.relative(root, d) || '.'} is a symbolic link after the install`,
        );
      }
      if (!inside(physical(d))) {
        refuse(
          `${path.relative(root, d) || '.'} resolves outside the workspace after the install`,
        );
      }
    }
    const modules = path.join(dir, 'node_modules');
    if (!existsSync(modules)) continue;
    const entries = [];
    for (const { name } of listDir(modules)) {
      if (name.startsWith('@')) {
        for (const { name: sub } of listDir(path.join(modules, name))) {
          entries.push(path.join(modules, name, sub));
        }
      } else if (name !== '.bin' && name !== '.pnpm') {
        entries.push(path.join(modules, name));
      }
    }
    for (const entry of entries) {
      let target;
      try {
        target = physical(entry);
      } catch {
        refuse(
          `${path.relative(root, entry)} does not resolve after the install`,
        );
      }
      if (!inside(target)) {
        refuse(
          `${path.relative(root, entry)} resolves outside the workspace after the install`,
        );
      }
    }
  }
}

// --- the tripwire -----------------------------------------------------------------------
//
// The install runs in a container that can write to the workspace's own
// files and to nothing else: not the repository's `.git`, not the runner's
// temp directory where the trusted scripts are staged, not the runner's home,
// not anything beside the workspace. This records those on the RUNNER before
// the container starts and compares them after it exits, and then walks the
// workspace for a link that would lead a later step out of it. With the
// container in place nothing differs; if anything ever does, containment has
// failed and the step must not go on to the agent.
//
// It reads names, kinds, sizes, times and link targets, and never follows a
// link. The only file contents it reads are under `.git`, which the branch
// does not supply, and the fixed settings files in the home directory.

function walk(dir, visit, skip, rel = '') {
  // NOTHING UNREADABLE. A directory that cannot be listed, or an entry that
  // cannot be examined, is a part of the tree this cannot vouch for.
  let entries;
  try {
    entries = listDir(path.join(dir, rel));
  } catch (err) {
    if (err instanceof Refusal) throw err;
    refuse(`${path.join(dir, rel)} cannot be listed (${err.code})`);
  }
  for (const e of entries.sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const r = rel === '' ? e.name : `${rel}/${e.name}`;
    const full = path.join(dir, r);
    if (skip?.(full, r)) continue;
    let st;
    try {
      st = lstatSync(full);
    } catch (err) {
      refuse(`${full} cannot be examined (${err.code})`);
    }
    visit(r, st, full);
    if (st.isDirectory()) walk(dir, visit, skip, r);
  }
}
const describe = (st) =>
  st === null
    ? 'unreadable'
    : `${st.isDirectory() ? 'd' : st.isSymbolicLink() ? 'l' : 'f'} ${st.mode.toString(8)} ${st.isDirectory() ? '' : st.size} ${st.isDirectory() ? '' : Math.floor(st.mtimeMs)}`;
const hashOf = (full) =>
  createHash('sha256').update(readFileSync(full)).digest('hex');

/** One file or directory, by content: for the few fixed paths that matter whole. */
function record(into, base, name, hashed = () => true) {
  const full = path.join(base, name);
  let st;
  try {
    st = lstatSync(full);
  } catch (err) {
    if (err.code !== 'ENOENT')
      refuse(`${full} cannot be examined (${err.code})`);
    into[name] = 'absent';
    return;
  }
  into[name] = describe(st);
  if (st.isSymbolicLink()) into[name] += ` ${linkText(full)}`;
  if (st.isFile()) into[name] += ` ${hashOf(full)}`;
  if (st.isDirectory()) {
    walk(full, (rel, s, f) => {
      const k = `${name}/${rel}`;
      into[k] = describe(s);
      if (s?.isSymbolicLink()) into[k] += ` ${linkText(f)}`;
      if (s?.isFile() && hashed(rel)) into[k] += ` ${hashOf(f)}`;
    });
  }
}

/** The package-manager settings a stray write to the home directory would be. */
const HOME_SETTINGS = [
  '.npmrc',
  '.yarnrc',
  '.yarnrc.yml',
  '.pnpmrc',
  '.config/pnpm',
];

/**
 * What must not change across the install: every entry of `.git` (content
 * hashed, except the object store, which is compared by size and time), every
 * entry of `runnerTemp` (but `exclude`, this step's own directory), the names
 * beside the workspace and beside its parent, and the settings files in
 * `home`.
 */
export function takeSnapshot(
  root,
  { runnerTemp = '', exclude = '', home = '' } = {},
) {
  const real = physical(root);
  const git = {};
  // The object store is large and cannot be written through a covered
  // mount either; size and time are enough for it.
  record(git, real, '.git', (rel) => !rel.startsWith('objects/'));
  const temp = {};
  if (runnerTemp !== '' && existsSync(runnerTemp)) {
    const skipped = exclude === '' ? null : physical(exclude);
    walk(
      physical(runnerTemp),
      (rel, s) => {
        temp[rel] = describe(s);
      },
      (full) => full === skipped,
    );
  }
  const beside = {};
  for (const dir of [path.dirname(real), path.dirname(path.dirname(real))]) {
    try {
      beside[dir] = listDir(dir)
        .map((e) => e.name)
        .sort();
    } catch (err) {
      if (err instanceof Refusal) throw err;
      beside[dir] = null;
    }
  }
  const settings = {};
  if (home !== '') {
    for (const name of HOME_SETTINGS) record(settings, home, name);
  }
  return { git, temp, beside, settings };
}

/** Refuse if `after` is not `before`, naming the first thing that differs. */
export function compareSnapshots(before, after) {
  const what = {
    git: "the repository's .git",
    temp: "the runner's temp directory",
    beside: 'the directories around the workspace',
    settings: "the package-manager settings in the runner's home",
  };
  for (const part of Object.keys(what)) {
    const a = before[part] ?? {};
    const b = after[part] ?? {};
    for (const k of [
      ...new Set([...Object.keys(a), ...Object.keys(b)]),
    ].sort()) {
      if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) {
        refuse(
          `the install changed ${what[part]} (${k}); it must only write inside the workspace's own files`,
        );
      }
    }
  }
}

/**
 * After the install, on the runner: no symbolic link in the workspace leads
 * out of it, into `.git`, into a trusted checkout or into the runner's temp
 * directory — whether the checkout had it or the install made it — and
 * there is no `.git` below the root. A later step that follows a link, or runs git
 * in a subdirectory, must end up among the workspace's own files.
 */
export function checkLinks(root, { runnerTemp = '' } = {}) {
  const real = physical(root);
  const temp =
    runnerTemp !== '' && existsSync(runnerTemp) ? physical(runnerTemp) : null;
  const under = (p, dir) => p === dir || p.startsWith(`${dir}${path.sep}`);
  walk(
    real,
    (rel, st, full) => {
      if (rel !== '.git' && path.basename(rel) === '.git') {
        refuse(`${rel}: a .git below the workspace root after the install`);
      }
      if (!st.isSymbolicLink()) return;
      // EVERY link, whether the checkout had it or the install made it.
      const target = linkText(full);
      const why = linkLeaves(real, full, target, temp);
      if (why !== '') {
        refuse(
          `${rel} is a symbolic link out of the workspace's own files after the install (it leads ${why})`,
        );
      }
      // ...and by where it resolves here, as far as it does.
      let resolved = null;
      try {
        resolved = physical(full);
      } catch {
        // It resolves nowhere here; the walk below still reads it.
      }
      if (resolved !== null) {
        const first = path.relative(real, resolved).split(path.sep)[0];
        if (
          !under(resolved, real) ||
          first === '.git' ||
          first.startsWith('.trusted-') ||
          (temp !== null && under(resolved, temp))
        ) {
          refuse(
            `${rel} is a symbolic link out of the workspace's own files after the install`,
          );
        }
      }
      // ...and by every link its target passes through.
      const strays = linkStrays(real, full, target, temp, true);
      if (strays !== '') {
        refuse(
          `${rel} is a symbolic link out of the workspace's own files after the install (it leads ${strays})`,
        );
      }
    },
    (full, rel) => rel === '.git',
  );
}

const USAGE =
  'usage: check-install-inputs.mjs before|installed <root> | snapshot|after <root> <file> [<runner temp> <exclude> <home>]';

// "Was this file run, or imported?" The default `realpathSync` on purpose:
// the question is which file the loader loaded, and that is how the loader
// resolved it. Asked any other way, the two sides could differ and the checks
// below would be skipped without a word.
if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === realpathSync(process.argv[1])
) {
  const [, , mode, root, file, runnerTemp = '', exclude = '', home = ''] =
    process.argv;
  try {
    if (!root || !['before', 'installed', 'snapshot', 'after'].includes(mode)) {
      throw new Refusal(USAGE);
    }
    if (mode === 'before') {
      checkBefore(root);
    } else if (mode === 'installed') {
      checkInstalled(root);
    } else {
      if (!file) throw new Refusal(USAGE);
      const now = takeSnapshot(root, { runnerTemp, exclude, home });
      if (mode === 'snapshot') {
        writeFileSync(file, JSON.stringify(now));
      } else {
        const before = JSON.parse(readFileSync(file, 'utf8'));
        compareSnapshots(before, now);
        checkLinks(root, { runnerTemp });
      }
    }
  } catch (err) {
    const message =
      err instanceof Refusal
        ? err.message
        : `could not check the install's inputs (${err.message})`;
    process.stderr.write(
      `::error::agent-toolchain: ${message.replace(/[\r\n]+/g, ' ')}\n`,
    );
    process.exit(1);
  }
}
