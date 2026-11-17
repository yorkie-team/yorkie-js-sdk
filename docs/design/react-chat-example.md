---
created: 2026-11-18
updated: 2026-11-18
tags: [examples, react, presence, homepage]
---

# React Chat Example

## Problem

The examples on yorkie.dev show co-editing (TodoMVC, Kanban, editors) and
presence (profile stack, cursors). None shows a messaging product. Chat is
one of the most common reasons teams look for a real-time backend. A
Slack-like example lets a visitor see in a few seconds how Yorkie handles the
moments chat apps get wrong: who is here and typing, two people reacting at
the same instant, a late joiner getting the history, and a client that drops
offline and comes back.

The homepage renders a web example in side-by-side iframes
(`BasicExampleView`): two by default, the visitor can go from 1 to 4, and
below a 640px viewport only the first pane is shown. Each iframe is a
separate Yorkie client on the same documents. The example has to
demonstrate collaboration across those panes, each pane can be as narrow as
about 300px, and it must still make sense alone in a single pane.

### Goals

- A new example `examples/react-chat` (React + Vite + `@yorkie-js/react`)
  with channels, messages, emoji reactions, and thread replies.
- Make four Yorkie strengths visible across panes:
  1. Presence: who is online, which channel each person is in, and who is
     typing.
  2. Concurrent merge: reactions from several panes at the same instant all
     count, exactly once per person.
  3. Persistence: a newly opened pane receives the day's history.
  4. Offline recovery: a pane switched offline keeps sending, and its
     messages appear everywhere once it is back online.
- Ship it on yorkie.dev under `/examples/chat` with a thumbnail.
- Code short and plain enough that a developer can copy the data model.

### Non-Goals

- Creating, renaming, or deleting channels. The channel set is fixed.
- Accounts, avatars, direct messages, file uploads, search, editing or
  deleting messages, unread counts across days, notifications.
- Persistence across a reload of an offline pane (`DocStore` / IndexedDB).
  Offline here means the pane stays open while its sync is paused.
- Moderation beyond client-side input cleanup (see Risks).
- Dark theme. Other web examples are light-only; this one matches them.

## Design

### Documents

Approach: one workspace Document plus one Document per channel.

| Document key | Root | Presence |
|---|---|---|
| `react-chat-<YYYYMMDD>` (workspace) | `{ channels: [{ id, name }] }` | `{ userId, name, color, joinedAt, channelId, typing }` |
| `react-chat-<YYYYMMDD>-<channelId>` | `{ messages: Message[] }` | none |

- The date part follows the other examples (`react-todomvc-<YYYYMMDD>`), so
  every visitor on the same day shares one workspace. `?key=<prefix>`
  overrides `react-chat-<YYYYMMDD>`, the same way TodoMVC reads `?key`.
- The workspace document stays attached for the whole session. Its presence
  drives the channel rail (who is in which channel), the online list, and
  the typing line. One attached document is enough for all of them, and the
  `Channel` API is not used because it reports only session counts, not who.
- A channel document is attached while that channel is open and detached
  when the user switches away. A client receives only the messages of the
  channel it is reading.
- Channels are fixed: `general`, `design`, `random`. The workspace root
  holds them so the list is data, not a constant hidden in the UI.

```ts
type Message = {
  id: string;        // random, made by the sender
  userId: string;
  name: string;
  color: PeerColor;  // 'blue' | 'green' | 'purple' | 'yellow' | 'red'
  text: string;
  at: string;        // ISO time, sender clock, display only
  reactions: { [emoji: string]: { [userId: string]: true } };
  replies: Reply[];  // Reply = Message without reactions and replies
};
```

### Identity

Each pane is a new user on every load: a random `userId`, a name from a
short list, and one of the five non-orange peer colors, chosen in memory.
Orange is the brand accent and is never a person's color.

Random picks collide, and panes that open together (as yorkie.dev's do)
cannot see each other yet when they pick. So every pane rechecks whenever
the presence list changes: on a clash with someone who joined earlier
(`joinedAt`, ties broken by `userId`), it moves to a name or color nobody
has. Every pane applies the same rule, so they settle on distinct names and
colors. Ids come from `crypto.randomUUID` with a fallback, since it exists
only in secure contexts. `localStorage` and
`sessionStorage` cannot be used because the homepage panes share one origin
and one tab, so stored identity would make all panes the same person.

### Reactions

A reaction is the key `reactions[emoji][userId]`. Toggling sets or deletes
that key. Two panes clicking the same emoji at once write different keys, so
both survive and the chip shows 2. This holds only if `reactions[emoji]`
already exists: if the first reaction created it, two first reactions would
both set the same `emoji` key and one would be lost. So a message is created
with one empty object per emoji in the fixed set (👍 🎉 👀 ❤️ 😂), and an
emptied emoji is never deleted. A `Counter` is not used: it cannot tell
"Ari clicked twice" from "Ari and Ben clicked once", and the toggle would
drift.

### Threads

Replies are an array inside the parent message. Opening a thread shows a
sheet over the message column; the reply box writes to `replies`.

### Offline

The header has a connection toggle. Offline calls
`client.changeSyncMode(doc, SyncMode.Manual)` on the open channel document
and the workspace document, and online switches both back to
`SyncMode.Realtime`. While offline the pane keeps accepting messages and
reactions; its own messages show a pending mark until the push lands.
Switching channel while offline is disabled, because attaching a channel
document needs the server. Switching is also held while a channel is still
opening and while the pane is going on or offline: `DocumentProvider`
detaches on unmount only if the attach has finished, so leaving a channel
mid-attach would leave it attached, and the next attach of that key would
fail. The message box stays disabled until the channel is attached.

This is a real disconnect, not a staged one. Manual mode cancels the watch
stream, so the client clears its online set: the offline pane's rail and
online list show only itself, and the other panes see it leave. Going back
online, it reappears with whatever it sent while away. Before switching
offline the pane sets `typing: false`, so no stale "is typing" is left
behind on the others.

### First message of the day

When a channel document is created for the day, `initialRoot` writes one
message in it from the author `Yorkie` (orange, `userId: 'yorkie'`). In
`#general` it says what to try: open another pane, react to this message
from both at once, switch one pane offline and keep typing. `#design` and
`#random` get one short line each. The `Yorkie` author never appears in the
online list or the rail dots, since it has no presence. `initialRoot` sets
the `messages` key, so two panes creating the day's document at once end up
with one array, not two.

When the online list holds only the pane itself, the rail shows a hint in
its place: "You're alone here. Add a user or open this page in another tab."

### Bounds

- Message and reply text: control and bidi characters stripped, runs of
  blanks collapsed, line breaks kept (at most one blank line), at most 500
  code points. Rendered as plain text; URLs are not
  turned into links.
- A channel keeps its newest 200 messages; a send that exceeds this deletes
  the oldest in the same update. Two panes trimming at once can leave a few
  over the cap until the next send. Daily keys bound the rest.
- The room is public and any client can write any shape, so messages are
  read through `readMessage`, which drops or repairs malformed entries
  instead of letting one bad write blank every pane.

### Screen

The structure is the "presence rail" layout chosen on the decision page:

- Left rail (168px): workspace name, channel list, then the online list. Each
  channel row ends with one dot per person currently in that channel, in
  their peer color. The open channel row has a 2px orange edge.
- Main column: channel header with "N here now", message list (avatar
  initial in peer color, name, time, text, reaction chips, "N replies"
  link), a typing line ("Ben is typing…"), and the composer.
- Thread: a 300px sheet from the right over the message column, with the
  parent message on top and a reply composer.
- From 900px the thread sits beside the messages instead of over them; at
  775px and below (where less than about 280px of messages would be left
  beside it) it covers the whole message column.
- Below 480px pane width the rail collapses behind a channel button in the
  header, and the thread sheet takes the full width.
- Visual system: the yorkie.dev "Shared Canvas" (`DESIGN.md` in
  yorkie-team.github.io): warm gray neutrals, Pretendard falling back to the
  system sans, 1px hairlines, 4px controls. Peer hues mean people only;
  orange is the brand accent for the open channel and the send button. The
  tokens the example needs are copied into its own CSS, since the example
  builds separately from the site.

### Homepage

In yorkie-team.github.io:

- Add `react-chat` to `STATIC_EXAMPLES` in `scripts/build-js-examples.mts`.
- Add an entry to `codes/examples.ts` (categories Presence and React
  Provider) and `pages/examples/chat.tsx`, modeled on `todomvc.tsx`, with
  `BasicExampleView`.
- `npm run fetch:examples` copies `examples/react-chat/thumbnail.jpg` and
  generates `fileInfo`.

The site does not build examples from SDK `main`. `fetch-js-examples.sh`
checks out the `v$NEXT_PUBLIC_YORKIE_JS_VERSION` tag unless `.env`'s
`YORKIE_JS_EXAMPLES_REF` pins a later commit. The homepage PR therefore
moves `YORKIE_JS_EXAMPLES_REF` to the SDK merge commit that adds
`react-chat` (the precedent is homepage#383), and merges after the SDK PR.
Once a release tag contains that commit, the tag wins and the pin can go.

### Risks and Mitigation

| Risk | Mitigation |
|------|------------|
| A daily key makes a public room: strangers on yorkie.dev can post anything | Chosen on purpose, matching the other examples. Input cleanup, length cap, plain-text rendering, no links; the room resets daily |
| Nested `DocumentProvider`s: hooks inside the channel provider resolve to the channel document, not the workspace | One `YorkieProvider`, a workspace `DocumentProvider`, and a channel `DocumentProvider` (keyed by channel) inside it. Workspace presence and the update function are read above the channel provider and passed down as props. Offline uses `useYorkie().client` with each provider's `useDocument().doc`. `useYorkieDoc` is not used: it creates its own client and exposes neither the client nor the document. The `syncMode` prop is not used for the toggle: changing it re-attaches a new document |
| Sender clocks differ, so `at` can misorder | Order is the array order, which the CRDT keeps; `at` is display only |
| Two watch streams per pane (workspace + channel). Over HTTP/1.1 a browser opens at most six connections per host, so a third pane in one browser stalls against the local server | yorkie.dev's server is HTTP/2. The README says to use another browser or a private window locally |
| Narrow and short panes (4 users on a laptop; the landing page embeds examples at about 590x250) | Rail collapses below 480px; the message list is the part that shrinks. Checked at 300, 480, 640px wide and at 600x260 |

### Design Decisions

| Decision | Reason |
|----------|--------|
| Workspace document + one document per channel | Mirrors how a real chat app splits data; a client syncs only the open channel |
| Presence on the workspace document only | One source for rail dots, online list, and typing; avoids presence on every channel document |
| Daily shared key | Same as the other examples, chosen by the maintainer |
| Reactions as `{emoji: {userId: true}}` | Concurrent toggles merge exactly once per person |
| Replies nested in the parent | The thread is read and written as one unit; no join by `parentId` |
| In-memory identity | Homepage panes share storage |
| Offline via `SyncMode.Manual` | Demonstrates offline edits and catch-up without the IndexedDB setup |
| Light theme only | Matches the other web examples |

## Alternatives Considered

| Alternative | Why not |
|-------------|---------|
| One document for the whole workspace | Shortest code, but every client receives every channel's messages; teaches a pattern that does not scale |
| Typing indicator over `Channel` broadcast | Adds a second mechanism for what presence already does, and blurs the example |
| A fresh room per page visit (`?key` from the homepage) | Avoids the public room, but the maintainer chose the daily key used by the other examples |
| `Counter` per emoji | Cannot express per-person toggles |
| Channel tabs with inline threads, or an initials rail with stacked thread view | Shown on the decision page; the presence rail was chosen because it makes presence part of the navigation |

## Tasks

[`docs/tasks/archive/2026/11/20261118-react-chat-example-todo.md`](../tasks/archive/2026/11/20261118-react-chat-example-todo.md)
