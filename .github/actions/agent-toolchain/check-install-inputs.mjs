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
// Usage (the action runs both, with a scrubbed environment):
//   node check-install-inputs.mjs before <workspace root>
//   node check-install-inputs.mjs after  <workspace root>
//
// It imports nothing but Node's own modules and reads only inside the root.

import {
  existsSync,
  lstatSync,
  readdirSync,
  readFileSync,
  realpathSync,
} from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

/** Thrown for anything refused; the message is what the step prints. */
export class Refusal extends Error {}
const refuse = (message) => {
  throw new Refusal(message);
};

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

/** Check one project's parsed `package.json`. `isRoot`: the workspace root's. */
export function checkManifest(manifest, file, isRoot) {
  if (
    manifest === null ||
    typeof manifest !== 'object' ||
    Array.isArray(manifest)
  ) {
    refuse(`${file}: not a JSON object`);
  }
  const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  for (const field of MANIFEST_DEP_FIELDS) {
    if (!own(manifest, field)) continue;
    const deps = manifest[field];
    if (deps === null || typeof deps !== 'object' || Array.isArray(deps)) {
      refuse(`${file}: ${field} is not an object`);
    }
    for (const [name, spec] of Object.entries(deps)) {
      if (!NAME.test(name)) refuse(`${file}: ${field} names \`${name}\``);
      if (!registrySpecifier(spec) && !workspaceSpecifier(spec)) {
        refuse(
          `${file}: ${name} is not asked for from the registry or the workspace`,
        );
      }
    }
  }
  // Fields that change what an install fetches, links or patches, and that
  // no manifest here uses.
  for (const field of ['resolutions', 'dependenciesMeta', 'publishDirectory']) {
    if (own(manifest, field)) refuse(`${file}: \`${field}\` is not allowed`);
  }
  if (own(manifest, 'publishConfig')) {
    const pc = manifest.publishConfig;
    if (pc === null || typeof pc !== 'object')
      refuse(`${file}: publishConfig is not an object`);
    for (const field of ['directory', 'linkDirectory']) {
      if (own(pc, field))
        refuse(`${file}: publishConfig.${field} is not allowed`);
    }
  }
  if (own(manifest, 'pnpm')) {
    // Only the root's is read for an install, and only `overrides` is used
    // here. Every other key (patches, extensions, build lists, a runtime to
    // download) is refused.
    if (!isRoot) refuse(`${file}: a \`pnpm\` field outside the root manifest`);
    const cfg = manifest.pnpm;
    if (cfg === null || typeof cfg !== 'object' || Array.isArray(cfg)) {
      refuse(`${file}: pnpm is not an object`);
    }
    for (const k of Object.keys(cfg)) {
      if (k !== 'overrides') refuse(`${file}: pnpm.${k} is not allowed`);
    }
    const overrides = cfg.overrides ?? {};
    if (
      overrides === null ||
      typeof overrides !== 'object' ||
      Array.isArray(overrides)
    ) {
      refuse(`${file}: pnpm.overrides is not an object`);
    }
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
  const entries = readdirSync(path.join(root, rel), { withFileTypes: true });
  for (const e of entries) {
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

/** Read and check everything the install reads from the tree at `root`. */
export function checkBefore(root) {
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
export function checkAfter(root) {
  const real = realpathSync(root);
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
      if (!inside(realpathSync(d))) {
        refuse(
          `${path.relative(root, d) || '.'} resolves outside the workspace after the install`,
        );
      }
    }
    const modules = path.join(dir, 'node_modules');
    if (!existsSync(modules)) continue;
    const entries = [];
    for (const name of readdirSync(modules)) {
      if (name.startsWith('@')) {
        for (const sub of readdirSync(path.join(modules, name))) {
          entries.push(path.join(modules, name, sub));
        }
      } else if (name !== '.bin' && name !== '.pnpm') {
        entries.push(path.join(modules, name));
      }
    }
    for (const entry of entries) {
      let target;
      try {
        target = realpathSync(entry);
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

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === realpathSync(process.argv[1])
) {
  const [, , mode, root] = process.argv;
  try {
    if (!root || !['before', 'after'].includes(mode)) {
      throw new Refusal('usage: check-install-inputs.mjs before|after <root>');
    }
    if (mode === 'before') checkBefore(root);
    else checkAfter(root);
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
