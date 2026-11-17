**Created**: 2026-11-18

Status: implemented on branch `react-chat-example`; verified with headless two-, three- and four-client checks against the local server.

# React Chat Example Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Add `examples/react-chat`, a Slack-like chat on Yorkie that shows presence, per-person reaction merge, persistence, and offline catch-up across side-by-side panes.

**Architecture:** One `YorkieProvider`, a workspace `DocumentProvider` (channel list + presence) that stays attached, and a channel `DocumentProvider` keyed by channel inside it (messages). Data rules live in a pure `model.ts` tested against a real local `Document`; components only read and call `update`.

**Tech Stack:** React 19, Vite 7, TypeScript 5.9, `@yorkie-js/react` (workspace), Vitest 4.

**Spec:** [`docs/design/react-chat-example.md`](../../design/react-chat-example.md)

## Global Constraints

- Directory and package name: `react-chat`; root script alias `"react-chat": "pnpm --filter=react-chat"`.
- Keys: workspace `react-chat-<YYYYMMDD>` (UTC date, like TodoMVC), channel `<prefix>-<channelId>`; `?key=<prefix>` overrides the prefix.
- Channels fixed: `general`, `design`, `random`.
- Person colors: `blue`, `green`, `purple`, `yellow`, `red`. Orange is brand only (open channel edge, send button, the `Yorkie` author).
- Text: control/bidi characters stripped, blanks collapsed, line breaks kept (at most one blank line), trimmed, at most 500 code points; empty → not sent. Plain text only, no links.
- A channel keeps its newest 200 messages.
- Identity in memory per load; no `localStorage`/`sessionStorage`.
- Visual system: yorkie.dev Shared Canvas tokens (copy the `:root` block from `examples/react-todomvc/src/App.css`), Pretendard via the same CDN link as TodoMVC, light only, 1px hairlines, 4px controls, peer hues mean people.
- Rail collapses below 480px pane width; thread sheet is 300px, full width below 480px.
- UI copy in English.

## Review Focus

1. Two panes create the day's channel at once → one `messages` array, one seed message (Task 1 test: `initialRoot` shape is a single `set`; Task 5 manual check with two fresh panes).
2. Going offline with text in the composer → others never keep a stale "is typing" (Task 4 step sets `typing: false` before `Manual`).
3. Switching channel mid-typing → the old channel's typing line clears on others (Task 3: presence `typing` resets on channel change).
4. Long unbroken text (a 500-character URL) → wraps inside the bubble, no horizontal scroll at 300px (Task 5 check).
5. A pane alone, or only the first pane on mobile → the rail shows the alone hint instead of an empty list (Task 2 render).

---

### Task 1: Scaffold and data model

**Files:**
- Create: `examples/react-chat/{package.json,index.html,vite.config.ts,tsconfig.json,tsconfig.node.json,eslint.config.mjs,README.md}`, `public/favicon.ico` (copy TodoMVC's), `src/{main.tsx,vite-env.d.ts,model.ts,model.test.ts}`
- Modify: root `package.json` (alias), `examples/README.md` (list)

**Interfaces:**
- Produces (`src/model.ts`):
  - `type PeerColor = 'blue' | 'green' | 'purple' | 'yellow' | 'red'`
  - `type Reply = { id; userId; name; color: PeerColor | 'orange'; text; at: number }`
  - `type Message = Reply & { reactions: Record<string, Record<string, true>>; replies: Reply[] }`
  - `type ChannelInfo = { id: string; name: string }`, `type WorkspaceRoot = { channels: ChannelInfo[] }`, `type ChannelRoot = { messages: Message[] }`
  - `type ChatPresence = { userId; name; color: PeerColor; channelId: string; typing: boolean }`
  - `defaultChannels: ChannelInfo[]`, `textMax = 500`, `messagesMax = 200`, `emojis = ['👍', '🎉', '👀', '❤️', '😂']`
  - `cleanText(raw: string): string | undefined`
  - `roomPrefix(search: string, now: Date): string`, `channelKey(prefix: string, channelId: string): string`
  - `makeUser(random?: () => number): Pick<ChatPresence, 'userId' | 'name' | 'color'>`
  - `seedRoot(channelId: string, now: Date): ChannelRoot`
  - `addMessage(root: ChannelRoot, m: Message): void`, `addReply(root: ChannelRoot, messageId: string, r: Reply): void`, `toggleReaction(root: ChannelRoot, messageId: string, emoji: string, userId: string): void`

- [x] **Step 1: Scaffold** — copy TodoMVC's config files; deps `@yorkie-js/react` and `@yorkie-js/sdk` (`workspace:*`), react/react-dom 19; devDeps as TodoMVC plus `vitest ^4.1.12`; scripts `dev`, `build` (`tsc && vite build`), `preview`, `test` (`vitest run`). `pnpm install` at root.
- [x] **Step 2: Write failing tests** in `model.test.ts` (mutators run inside `new Document(key).update(...)` from `@yorkie-js/sdk`):
  - `cleanText`: `'  a\u0000b \n c '` → `'ab c'`; `'‮x'` → `'x'`; `'   '` → `undefined`; 600 × `'가'` → length 500 code points; an emoji counts as one.
  - `roomPrefix('', new Date('2026-11-18T10:00:00Z'))` → `'react-chat-20261118'`; `roomPrefix('?key=team', …)` → `'team'`; `channelKey('team', 'design')` → `'team-design'`.
  - `makeUser(() => 0)` color is `'blue'`; across 100 calls with `Math.random` no color is `'orange'`.
  - `seedRoot('general', now).messages` has 1 message from `userId: 'yorkie'`, `color: 'orange'`, text mentioning "another pane" and "offline"; `seedRoot('design', now)` has 1 message.
  - `addMessage` 201 times → length 200 and the first remaining is the 2nd added.
  - `toggleReaction` by `u1` then `u2` → `reactions['👍']` has 2 keys; again by `u1` → 1 key; again by `u2` → emoji key removed.
  - `addReply` → `replies` length 1 on the right message; unknown id → no change.
- [x] **Step 3: Run** `pnpm react-chat test` → FAIL (module missing).
- [x] **Step 4: Implement `model.ts`.** Trim the oldest with `getElementByIndex(0)` + `deleteByID` on Yorkie arrays; delete a reaction key with `delete obj[key]`.
- [x] **Step 5: Run** `pnpm react-chat test` → PASS; `pnpm react-chat build` → succeeds with a placeholder `App`.
- [x] **Step 6: Commit** `Add the react-chat example scaffold and data model`.

### Task 2: Workspace shell and presence rail

**Files:** Create `src/App.tsx`, `src/ExampleHeader.tsx` (adapted from TodoMVC: title "React Chat", hint, status, `children` slot), `src/ChannelRail.tsx`, `src/App.css`

**Interfaces:**
- Consumes: Task 1 model.
- Produces: `App` renders `YorkieProvider` → `DocumentProvider<WorkspaceRoot, ChatPresence>` (key `roomPrefix(...)`, `initialRoot { channels: defaultChannels }`, `initialPresence { ...makeUser(), channelId: 'general', typing: false }`) → `Workspace`. `Workspace` reads `useDocument()` once and passes `{ me, presences, updateWorkspace, workspaceDoc }` down. `ChannelRail({ channels, presences, me, openId, onOpen, disabled })`.

- [x] **Step 1:** Rail per design: workspace name, "Channels" list with one dot per person whose `channelId` matches (peer color, `aria-label` with names), open row with 2px orange inset edge, "Online · N" list, the user's own row "(you)". When `presences.length === 1` show "You're alone here. Add a user or open this page in another tab." in place of the online list.
- [x] **Step 2:** Opening a channel sets presence `channelId` and `typing: false` in one `update`.
- [x] **Step 3:** Loading, error (same copy pattern as TodoMVC) states.
- [x] **Step 4: Verify** `pnpm react-chat build` passes; `pnpm react-chat dev` with the local server: two tabs show each other's dots; switching a channel moves the dot.
- [x] **Step 5: Commit** `Show who is in which channel in the chat rail`.

### Task 3: Channel view, reactions, threads

**Files:** Create `src/ChannelView.tsx`, `src/MessageList.tsx`, `src/Composer.tsx`, `src/ThreadSheet.tsx`; modify `src/App.tsx`, `src/App.css`

**Interfaces:**
- Consumes: Task 2 props (`me`, `presences`, `updateWorkspace`).
- Produces: `<DocumentProvider key={channelId} docKey={channelKey(prefix, channelId)} initialRoot={seedRoot(channelId, now)} disablePresence>` → `ChannelView({ channel, me, presences, setTyping(b: boolean), offline, pendingIds })`, exposing its `doc` upward through `onDoc(doc | undefined)` for Task 4.

- [x] **Step 1:** Header `# name` and "N here now" (presences in this channel).
- [x] **Step 2:** Message rows: initial avatar in the author color, name, `HH:MM`, text (`white-space: pre-wrap; overflow-wrap: anywhere`), reaction chips (`emoji count`, own reaction outlined in the user's color, `aria-pressed`), a react button opening the 5-emoji picker, "N replies" link. Auto-scroll to bottom on new messages only when already at bottom.
- [x] **Step 3:** Composer: `cleanText` on send, Enter sends, Shift+Enter newline, Enter during IME composition ignored, `maxLength` by code points shown when near the limit. `setTyping(true)` on input while non-empty, `false` on send, blur, empty, or 3s idle.
- [x] **Step 4:** Typing line: "Ben is typing…", "Ben and Cleo are typing…", "Several people are typing…" from presences in this channel other than me.
- [x] **Step 5:** Thread sheet: parent on top, replies, reply composer (no typing presence), close button and Esc; focus moves into the sheet and back to the "replies" link on close.
- [x] **Step 6: Verify** in two tabs: message, reaction from both at once shows 2, reply appears in both, new tab gets history.
- [x] **Step 7: Commit** `Add messages, reactions, and threads to the chat example`.

### Task 4: Offline toggle

**Files:** Modify `src/App.tsx`, `src/ExampleHeader.tsx` slot, `src/MessageList.tsx`

**Interfaces:**
- Consumes: `useYorkie().client`, workspace `doc`, channel `doc` from `onDoc`.

- [x] **Step 1:** Header switch "Online / Offline" (`role="switch"`). Going offline: `updateWorkspace` with `typing: false`, then `client.changeSyncMode(doc, SyncMode.Manual)` on the channel doc and the workspace doc. Going online: `SyncMode.Realtime` on both, then `client.sync(channelDoc)`; clear `pendingIds` when it resolves.
- [x] **Step 2:** While offline: messages sent get their id into `pendingIds` and render with a "Not sent yet" mark; rail channel rows are disabled with a title "Reconnect to switch channels".
- [x] **Step 3: Verify** two tabs: A offline, B sees A leave; A sends two messages; A online → B sees both and A back in the rail.
- [x] **Step 4: Commit** `Let a chat pane go offline and catch up`.

### Task 5: Responsive layout, README, thumbnail, finish

**Files:** Modify `src/App.css`, `src/ChannelRail.tsx`, `README.md`; create `thumbnail.jpg`

- [x] **Step 1:** Container query on the app root: below 480px the rail hides behind a "# general ▾" button in the channel header (opens it as an overlay list), the thread sheet goes full width. Message list is the flexible region at 600x260.
- [x] **Step 2:** Headless check (Playwright recipe in second-brain memory) at 1280x800, 600x260, 480x700, 300x700 with two clients; long-text and alone states; fix overlap/clipping.
- [x] **Step 3:** README (what it shows, the four things to try, keys, how to run), `thumbnail.jpg` 3:2 from a two-pane capture.
- [x] **Step 4:** `pnpm lint:check`, `pnpm react-chat test`, `pnpm react-chat build`, `pnpm build:examples` succeed.
- [x] **Step 5: Commit** `Fit the chat example to narrow panes and document it`.

## Review

- Code review (fresh reviewer, whole branch) and impeccable finish review
  (two verdict rounds) ran after Task 5. Fixes landed as "Harden the chat
  example against races and bad data", "Make presence read as navigation in
  the chat example", and "Animate a chat dot leaving as well as arriving".
- Checks: `pnpm react-chat test` (31 tests, incl. a two-replica reaction
  merge), lint, build, `impeccable detect` (0 findings), and headless
  checks: two-pane channel flow, offline catch-up, four panes joining at
  once (8/8 distinct identities), quick channel switching, sizes 1440x900,
  1280x800, 640, 600x260, 480, 390x844, 300.
- `pnpm build:examples` stops at `nextjs-scheduler` and `nextjs-presence`:
  Next.js refuses to build because the pinned version has a known
  vulnerability. Not touched by this branch; react-chat builds.

## Follow-ups

- `@yorkie-js/react` `DocumentProvider`: unmounting before the attach
  resolves skips the detach, so the document stays attached and a later
  attach of the same key fails (`ErrAlreadyAttached`). The example works
  around it by holding the rail while a channel opens.
- yorkie-team.github.io: add `react-chat` to `STATIC_EXAMPLES`, a
  `codes/examples.ts` entry, `pages/examples/chat.tsx`, and move
  `YORKIE_JS_EXAMPLES_REF` to this branch's merge commit.
- Upgrade Next.js in `nextjs-scheduler` and `nextjs-presence` so
  `pnpm build:examples` passes again.
