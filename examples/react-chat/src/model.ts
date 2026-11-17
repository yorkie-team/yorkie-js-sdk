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

// Control characters, zero-width and direction marks, line/paragraph
// separators, bidi embeddings and isolates, and the BOM. Line breaks are
// kept so Shift+Enter can make a multi-line message.
const unsafe =
  // eslint-disable-next-line no-control-regex
  /[\u0000-\u0009\u000b-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069\ufeff]/g;

/**
 * `cleanText` returns `raw` as it may be sent: unsafe characters removed,
 * runs of blanks collapsed (line breaks kept, at most two in a row), trimmed,
 * and cut to `textMax` code points. `undefined` means there is nothing to send.
 */
export function cleanText(raw: string): string | undefined {
  const s = raw
    .replace(/\r\n?/g, '\n')
    .replace(unsafe, '')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  const out = [...s].slice(0, textMax).join('').trim();
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
 * `makeUser` makes a new person for this pane. It is kept in memory only:
 * the homepage's panes share one origin and one tab, so stored identity would
 * make every pane the same person.
 */
export function makeUser(
  random: () => number = Math.random,
): Pick<ChatPresence, 'userId' | 'name' | 'color'> {
  const pick = <T>(list: ReadonlyArray<T>) =>
    list[Math.floor(random() * list.length) % list.length];
  return {
    userId: crypto.randomUUID(),
    name: pick(names),
    color: pick(peerColors),
  };
}

/**
 * `distinctFrom` returns a name and color for `me` that nobody else in
 * `others` has, keeping its own where they are free. Two panes picking at
 * random can land on the same color, which would hide who is who.
 */
export function distinctFrom(
  me: Pick<ChatPresence, 'name' | 'color'>,
  others: Array<Pick<ChatPresence, 'name' | 'color'>>,
): Pick<ChatPresence, 'name' | 'color'> {
  const usedNames = new Set(others.map((p) => p.name));
  const usedColors = new Set(others.map((p) => p.color));
  return {
    name: usedNames.has(me.name)
      ? (names.find((n) => !usedNames.has(n)) ?? me.name)
      : me.name,
    color: usedColors.has(me.color)
      ? (peerColors.find((c) => !usedColors.has(c)) ?? me.color)
      : me.color,
  };
}

const seedText: Record<string, string> = {
  general:
    'Welcome! Open another pane to chat with yourself, react to this message from both at once, then switch one pane offline and keep typing.',
  design: 'Share mockups and feedback here.',
  random: 'Anything goes.',
};

/**
 * `seedRoot` is the first content of a channel document for the day. It is
 * passed as `initialRoot`, which sets `messages` as one value, so two panes
 * creating the document at once end up with one array, not two.
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

/** `addMessage` appends `m` and drops the oldest past `messagesMax`. */
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
