import type { JSONArray, JSONObject } from '@yorkie-js/react';

/** The colors a person can have. Orange is the brand's and stays out. */
export const peerColors = ['blue', 'green', 'purple', 'yellow', 'red'] as const;
export type PeerColor = (typeof peerColors)[number];

/** A reply in a thread. The `Yorkie` guide message is the only orange one. */
export type Reply = {
  id: string;
  userId: string;
  name: string;
  color: PeerColor | 'orange';
  text: string;
  /**
   * Sender's clock as an ISO string, for display only; order is the array
   * order. (A millisecond number would not fit Yorkie's int32 and come back
   * as a bigint.)
   */
  at: string;
};

/**
 * A message in a channel. A reaction is the key `reactions[emoji][userId]`,
 * so two people reacting at the same instant write different keys and both
 * count, and the same person can only count once.
 */
export type Message = Reply & {
  reactions: Record<string, Record<string, true>>;
  replies: Array<Reply>;
};

export type ChannelInfo = { id: string; name: string };

/** The workspace document: the channel list. Its presence is who is where. */
export type WorkspaceRoot = { channels: JSONArray<ChannelInfo> };

/** One document per channel: its messages. */
export type ChannelRoot = { messages: JSONArray<Message> };

export type ChatPresence = {
  userId: string;
  name: string;
  color: PeerColor;
  /** When this pane joined (ISO). On a name or color clash, the earlier keeps it. */
  joinedAt: string;
  channelId: string;
  typing: boolean;
};

export const defaultChannels: Array<ChannelInfo> = [
  { id: 'general', name: 'general' },
  { id: 'design', name: 'design' },
  { id: 'random', name: 'random' },
];

export const textMax = 500;
export const messagesMax = 200;
export const emojis = ['👍', '🎉', '👀', '❤️', '😂'];

const names = [
  'Ari',
  'Ben',
  'Cleo',
  'Dana',
  'Eli',
  'Fern',
  'Gus',
  'Hana',
  'Ivo',
  'June',
];

// Control characters, the zero-width space, direction marks, line/paragraph
// separators, bidi embeddings and isolates, and the BOM. Kept: line breaks,
// so Shift+Enter can make a multi-line message; tabs, which the blank
// collapse turns into spaces; and the zero-width (non-)joiners, which
// compound emoji such as 👩‍💻 and scripts such as Persian need.
const unsafe =
  // eslint-disable-next-line no-control-regex
  /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u200b\u200e\u200f\u2028-\u202e\u2066-\u2069\ufeff]/g;

/**
 * `normalizeText` is `raw` with unsafe characters removed, runs of blanks
 * collapsed (line breaks kept, at most two in a row), and trimmed.
 */
export function normalizeText(raw: string): string {
  return raw
    .replace(/\r\n?/g, '\n')
    .replace(unsafe, '')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * `cleanText` returns `raw` as it may be sent: normalized and cut to
 * `textMax` code points. `undefined` means there is nothing to send.
 */
export function cleanText(raw: string): string | undefined {
  return toSendable(normalizeText(raw));
}

/** `toSendable` cuts already normalized text to `textMax` code points. */
export function toSendable(normalized: string): string | undefined {
  const out = [...normalized].slice(0, textMax).join('').trim();
  return out.length ? out : undefined;
}

/**
 * `roomPrefix` is the key every document of this room starts with:
 * `?key=<prefix>` when given, else `react-chat-<YYYYMMDD>` (UTC), so everyone
 * opening the example on the same day shares one workspace.
 */
export function roomPrefix(search: string, now: Date): string {
  const key = new URLSearchParams(search).get('key');
  if (key) return key;
  return `react-chat-${now.toISOString().slice(0, 10).replace(/-/g, '')}`;
}

export function channelKey(prefix: string, channelId: string): string {
  return `${prefix}-${channelId}`;
}

/**
 * `newId` is a random id. `crypto.randomUUID` exists only in secure contexts,
 * so a page opened over plain http (a phone on the LAN, say) falls back.
 */
export function newId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/**
 * `makeUser` makes a new person for this pane. It is kept in memory only:
 * the homepage's panes share one origin and one tab, so stored identity would
 * make every pane the same person.
 */
export function makeUser(
  random: () => number = Math.random,
): Pick<ChatPresence, 'userId' | 'name' | 'color' | 'joinedAt'> {
  const pick = <T>(list: ReadonlyArray<T>) =>
    list[Math.floor(random() * list.length) % list.length];
  return {
    userId: newId(),
    name: pick(names),
    color: pick(peerColors),
    joinedAt: new Date().toISOString(),
  };
}

/** Whether `other` keeps its name and color when it collides with `me`. */
function outranks(other: ChatPresence, me: ChatPresence): boolean {
  if (other.joinedAt !== me.joinedAt) return other.joinedAt < me.joinedAt;
  return other.userId < me.userId;
}

/**
 * `resolveIdentity` returns the name and color `me` should have among
 * `others`. Random picks can collide, and panes that open together cannot see
 * each other yet when they pick, so every pane checks again as people arrive:
 * on a collision the one who joined later moves to a name or color nobody
 * has (ties go by `userId`), so all panes settle the same way.
 */
export function resolveIdentity(
  me: ChatPresence,
  others: Array<ChatPresence>,
): Pick<ChatPresence, 'name' | 'color'> {
  const seniors = others.filter((o) => outranks(o, me));
  const usedNames = new Set(others.map((p) => p.name));
  const usedColors = new Set(others.map((p) => p.color));
  const name = seniors.some((o) => o.name === me.name)
    ? (names.find((n) => !usedNames.has(n)) ?? me.name)
    : me.name;
  const color = seniors.some((o) => o.color === me.color)
    ? (peerColors.find((c) => !usedColors.has(c)) ?? me.color)
    : me.color;
  return { name, color };
}

const seedText: Record<string, string> = {
  general:
    'Welcome! Open this page in another tab to chat with yourself, react to this message from both at once, then take one tab offline and keep typing.',
  design: 'Share mockups and feedback here.',
  random: 'Anything goes.',
};

/**
 * `seedRoot` is the first content of a channel document for the day. It is
 * passed as `initialRoot`, which sets `messages` as one value, so two panes
 * creating the document at once end up with one array, not two. (If both
 * set it before either sees the other, one array wins, and a write made
 * into the losing one in that moment is dropped.)
 */
export function seedRoot(channelId: string, now: Date): ChannelRoot {
  const seed: Message = {
    id: `seed-${channelId}`,
    userId: 'yorkie',
    name: 'Yorkie',
    color: 'orange',
    text: seedText[channelId] ?? 'Say hello.',
    at: now.toISOString(),
    reactions: emptyReactions(),
    replies: [],
  };
  return { messages: [seed] as JSONArray<Message> };
}

/**
 * `addMessage` appends `m` and drops the oldest past `messagesMax`. Two panes
 * trimming at once can leave a few over the cap; the next send trims them.
 */
export function addMessage(root: ChannelRoot, m: Message): void {
  root.messages.push(m);
  while (root.messages.length > messagesMax) {
    root.messages.deleteByID(root.messages.getElementByIndex(0).getID());
  }
}

/** `addReply` appends `r` to the thread of `messageId`, if it is still there. */
export function addReply(root: ChannelRoot, messageId: string, r: Reply): void {
  root.messages.find((m) => m.id === messageId)?.replies.push(r);
}

/**
 * `emptyReactions` is a new message's reactions: one empty object per emoji,
 * made up front. If the first reaction created `reactions[emoji]`, two people
 * reacting at once would both create that key, and only one would survive.
 * With the objects already there, each writes its own `userId` key inside.
 * For the same reason an emoji is never deleted, only emptied.
 */
export function emptyReactions(): Record<string, Record<string, true>> {
  return Object.fromEntries(emojis.map((e) => [e, {}]));
}

/** `toggleReaction` adds or removes `userId`'s `emoji` on `messageId`. */
export function toggleReaction(
  root: ChannelRoot,
  messageId: string,
  emoji: string,
  userId: string,
): void {
  const people = root.messages.find((m) => m.id === messageId)?.reactions[
    emoji
  ] as JSONObject<Record<string, true>> | undefined;
  if (!people) return;
  if (people[userId]) {
    delete people[userId];
  } else {
    people[userId] = true;
  }
}

/** `reactionCount` is how many people reacted with one emoji. */
export function reactionCount(
  people: Record<string, true> | undefined,
): number {
  return people ? Object.keys(people).length : 0;
}

// A Yorkie array is a Proxy, for which `Array.isArray` is false: test for
// iterability instead.
const isList = (v: unknown): v is Iterable<unknown> =>
  typeof v === 'object' &&
  v !== null &&
  typeof (v as Iterable<unknown>)[Symbol.iterator] === 'function';

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !isList(v);

function readReply(raw: unknown): Reply | undefined {
  if (!isRecord(raw) || typeof raw.id !== 'string') return undefined;
  const at = typeof raw.at === 'string' ? raw.at : '';
  return {
    id: raw.id,
    userId: typeof raw.userId === 'string' ? raw.userId : '',
    name:
      (typeof raw.name === 'string' &&
        [...(cleanText(raw.name) ?? '')].slice(0, 24).join('')) ||
      'Someone',
    color:
      peerColors.includes(raw.color as PeerColor) || raw.color === 'orange'
        ? (raw.color as Reply['color'])
        : 'blue',
    // Remote text gets the same cleanup and cap as text typed here: other
    // clients are not bound by this one's composer.
    text: typeof raw.text === 'string' ? (cleanText(raw.text) ?? '') : '',
    at: Number.isNaN(Date.parse(at)) ? '' : at,
  };
}

/**
 * `readMessage` is a stored message as it may be drawn, or `undefined` when
 * it cannot be. The daily room is public and any client can write any
 * shape, so one malformed message must not take every pane down with it.
 * An empty `at` means the time is unknown.
 */
export function readMessage(raw: unknown): Message | undefined {
  const base = readReply(raw);
  if (!base || !isRecord(raw)) return undefined;
  const reactions: Message['reactions'] = {};
  if (isRecord(raw.reactions)) {
    for (const [emoji, people] of Object.entries(raw.reactions)) {
      if (isRecord(people)) {
        reactions[emoji] = Object.fromEntries(
          Object.keys(people).map((id) => [id, true as const]),
        );
      }
    }
  }
  const replies = isList(raw.replies)
    ? Array.from(raw.replies, readReply).filter((r): r is Reply => !!r)
    : [];
  return { ...base, reactions, replies };
}

/** `readMessages` is a channel's stored messages as they may be drawn. */
export function readMessages(raw: unknown): Array<Message> {
  if (!isList(raw)) return [];
  return Array.from(raw, readMessage).filter((m): m is Message => !!m);
}

/**
 * `readChannels` is the workspace's stored channel list as it may be used:
 * ids that can go into a document key, falling back to the default channels
 * when nothing usable is stored.
 */
export function readChannels(raw: unknown): Array<ChannelInfo> {
  if (!isList(raw)) return defaultChannels;
  const seen = new Set<string>();
  const out: Array<ChannelInfo> = [];
  for (const c of raw) {
    if (!isRecord(c) || typeof c.id !== 'string') continue;
    if (!/^[a-z0-9-]{1,32}$/.test(c.id) || seen.has(c.id)) continue;
    seen.add(c.id);
    const name = typeof c.name === 'string' ? cleanText(c.name) : undefined;
    out.push({ id: c.id, name: name ? [...name].slice(0, 32).join('') : c.id });
  }
  return out.length ? out : defaultChannels;
}
