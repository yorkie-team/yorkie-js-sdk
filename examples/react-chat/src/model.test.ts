import { describe, expect, it } from 'vitest';
import { Document, type JSONArray } from '@yorkie-js/sdk';
import {
  addMessage,
  addReply,
  channelKey,
  emptyReactions,
  type ChannelRoot,
  type ChatPresence,
  cleanText,
  defaultChannels,
  makeUser,
  type Message,
  messagesMax,
  newId,
  normalizeText,
  readChannels,
  readMessage,
  readMessages,
  type PeerColor,
  resolveIdentity,
  roomPrefix,
  seedRoot,
  toggleReaction,
} from './model';

const now = new Date('2026-11-18T10:00:00Z');

function message(id: string, text = id): Message {
  return {
    id,
    userId: 'u1',
    name: 'Ari',
    color: 'blue',
    text,
    at: now.toISOString(),
    reactions: emptyReactions(),
    replies: [],
  };
}

function channelDoc(): Document<ChannelRoot> {
  const doc = new Document<ChannelRoot>('test-channel');
  doc.update((root) => {
    root.messages = [message('m1')] as JSONArray<Message>;
  });
  return doc;
}

describe('cleanText', () => {
  it('strips control characters and collapses blanks', () => {
    expect(cleanText('  a\u0000b   c ')).toBe('ab c');
  });

  it('counts what would be sent before cutting', () => {
    expect([
      ...normalizeText(`${' '.repeat(400)}a${' \n'.repeat(300)}`),
    ]).toHaveLength(1);
  });

  it('turns tabs into spaces', () => {
    expect(cleanText('a\tb')).toBe('a b');
  });

  it('keeps compound emoji whole', () => {
    expect(cleanText('👩‍💻 🏳️‍🌈')).toBe('👩‍💻 🏳️‍🌈');
  });

  it('keeps line breaks, at most one blank line', () => {
    expect(cleanText('a \n b\n\n\n\nc')).toBe('a\nb\n\nc');
  });

  it('strips direction overrides', () => {
    expect(cleanText('\u202Ex')).toBe('x');
  });

  it('returns undefined for blank input', () => {
    expect(cleanText('   ')).toBeUndefined();
  });

  it('keeps at most 500 code points', () => {
    expect([...(cleanText('가'.repeat(600)) ?? '')]).toHaveLength(500);
    expect([...(cleanText('😀'.repeat(600)) ?? '')]).toHaveLength(500);
  });
});

describe('keys', () => {
  it('uses the UTC date by default', () => {
    expect(roomPrefix('', now)).toBe('react-chat-20261118');
  });

  it('lets ?key override the prefix', () => {
    expect(roomPrefix('?key=team', now)).toBe('team');
  });

  it('suffixes the channel id', () => {
    expect(channelKey('team', 'design')).toBe('team-design');
  });
});

describe('newId', () => {
  it('falls back when randomUUID is missing', () => {
    const original = crypto.randomUUID;
    Object.defineProperty(crypto, 'randomUUID', {
      value: undefined,
      configurable: true,
    });
    try {
      const a = newId();
      expect(a).toMatch(/^[a-z0-9]+-[a-z0-9]+$/);
      expect(newId()).not.toBe(a);
    } finally {
      Object.defineProperty(crypto, 'randomUUID', {
        value: original,
        configurable: true,
      });
    }
  });
});

describe('makeUser', () => {
  it('picks from the person colors', () => {
    expect(makeUser(() => 0).color).toBe('blue');
  });

  it('never picks orange', () => {
    for (let i = 0; i < 100; i++) {
      expect(makeUser().color).not.toBe('orange');
    }
  });
});

describe('resolveIdentity', () => {
  const person = (
    userId: string,
    name: string,
    color: PeerColor,
    joinedAt = '2026-11-18T10:00:00.000Z',
  ): ChatPresence => ({
    userId,
    name,
    color,
    joinedAt,
    channelId: 'general',
    typing: false,
  });

  it('keeps a free name and color', () => {
    const me = person('b', 'Ari', 'blue');
    expect(resolveIdentity(me, [person('a', 'Ben', 'green')])).toEqual({
      name: 'Ari',
      color: 'blue',
    });
  });

  it('moves the later joiner off a clash', () => {
    const early = person('z', 'Ari', 'blue', '2026-11-18T10:00:00.000Z');
    const late = person('a', 'Ari', 'blue', '2026-11-18T10:00:01.000Z');
    expect(resolveIdentity(early, [late])).toEqual({
      name: 'Ari',
      color: 'blue',
    });
    expect(resolveIdentity(late, [early])).toEqual({
      name: 'Ben',
      color: 'green',
    });
  });

  it('breaks a tie by userId, so both panes agree', () => {
    const a = person('a', 'Gus', 'yellow');
    const b = person('b', 'Gus', 'blue');
    expect(resolveIdentity(a, [b]).name).toBe('Gus');
    expect(resolveIdentity(b, [a]).name).not.toBe('Gus');
    expect(resolveIdentity(b, [a]).color).toBe('blue');
  });

  it('keeps its color when every color is taken', () => {
    const others = (['blue', 'green', 'purple', 'yellow', 'red'] as const).map(
      (color, i) => person(`0${i}`, `P${i}`, color),
    );
    expect(resolveIdentity(person('z', 'Ari', 'red'), others).color).toBe(
      'red',
    );
  });
});

describe('readMessage', () => {
  it('passes a well-formed message through', () => {
    const m = message('m1');
    expect(readMessage(m)).toEqual(m);
  });

  it('reads a message straight from a document', () => {
    const doc = channelDoc();
    const { id, userId, name, color, text, at } = message('r1');
    doc.update((root) => {
      addReply(root, 'm1', { id, userId, name, color, text, at });
      toggleReaction(root, 'm1', '👍', 'u1');
    });
    const m = readMessage(doc.getRoot().messages[0]);
    expect(m?.replies.map((r) => r.id)).toEqual(['r1']);
    expect(m?.reactions['👍']).toEqual({ u1: true });
  });

  it('drops what cannot be drawn', () => {
    expect(readMessage(undefined)).toBeUndefined();
    expect(readMessage({ text: 'no id' })).toBeUndefined();
  });

  it('fills in missing or broken fields', () => {
    const m = readMessage({ id: 'x', at: 1794928803603n, color: 'teal' });
    expect(m).toMatchObject({
      id: 'x',
      text: '',
      at: '',
      color: 'blue',
      reactions: {},
      replies: [],
    });
  });
});

describe('remote text', () => {
  it('cleans and caps text another client stored', () => {
    const m = readMessage({ id: 'x', text: '\u202E' + 'a'.repeat(900) });
    expect([...(m?.text ?? '')]).toHaveLength(500);
    expect(m?.text.startsWith('a')).toBe(true);
  });
});

describe('readMessages', () => {
  it('reads a stored list and skips bad entries', () => {
    expect(readMessages([message('m1'), 3, {}]).map((m) => m.id)).toEqual([
      'm1',
    ]);
  });

  it('treats anything but a list as empty', () => {
    expect(readMessages({})).toEqual([]);
    expect(readMessages('x')).toEqual([]);
  });
});

describe('reading a public room', () => {
  it('keeps only the fixed emoji set', () => {
    const m = readMessage({
      ...message('x'),
      reactions: {
        '👍': { a: true },
        ['\u202E' + 'x'.repeat(50)]: { b: true },
      },
    });
    expect(Object.keys(m?.reactions ?? {})).toEqual(['👍']);
  });

  it('drops messages and replies with a repeated id', () => {
    const r = {
      id: 'r',
      userId: 'u',
      name: 'A',
      color: 'blue',
      text: 't',
      at: '',
    };
    const list = readMessages([
      { ...message('m'), replies: [r, r] },
      message('m'),
    ]);
    expect(list).toHaveLength(1);
    expect(list[0].replies).toHaveLength(1);
  });

  it('skips writes to a malformed message instead of throwing', () => {
    const doc = new Document<ChannelRoot>('test-bad');
    doc.update((root) => {
      root.messages = [{ id: 'bad' }] as unknown as JSONArray<Message>;
    });
    const { id, userId, name, color, text, at } = message('r1');
    expect(() =>
      doc.update((root) => {
        toggleReaction(root, 'bad', '👍', 'u1');
        addReply(root, 'bad', { id, userId, name, color, text, at });
      }),
    ).not.toThrow();
  });
});

describe('readChannels', () => {
  it('keeps usable channels', () => {
    expect(readChannels([{ id: 'ops', name: 'ops' }])).toEqual([
      { id: 'ops', name: 'ops' },
    ]);
  });

  it('drops ids that cannot go into a key, and duplicates', () => {
    expect(
      readChannels([{ id: 'ok' }, { id: '../x' }, {}, { id: 'ok' }]),
    ).toEqual([{ id: 'ok', name: 'ok' }]);
  });

  it('falls back to the default channels', () => {
    expect(readChannels({})).toBe(defaultChannels);
    expect(readChannels([{}])).toBe(defaultChannels);
  });
});

describe('seedRoot', () => {
  it('starts every message with an empty object per emoji', () => {
    expect(Object.keys(seedRoot('general', now).messages[0].reactions)).toEqual(
      ['👍', '🎉', '👀', '❤️', '😂'],
    );
  });

  it('greets #general with what to try', () => {
    const { messages } = seedRoot('general', now);
    expect(messages).toHaveLength(1);
    expect(messages[0].userId).toBe('yorkie');
    expect(messages[0].color).toBe('orange');
    expect(messages[0].text).toMatch(/another tab/);
    expect(messages[0].text).toMatch(/offline/);
  });

  it('seeds one line in the other channels', () => {
    expect(seedRoot('design', now).messages).toHaveLength(1);
  });
});

describe('addMessage', () => {
  it('keeps the newest messagesMax messages', () => {
    const doc = new Document<ChannelRoot>('test-trim');
    doc.update((root) => {
      root.messages = [] as unknown as JSONArray<Message>;
    });
    for (let i = 0; i <= messagesMax; i++) {
      doc.update((root) => addMessage(root, message(`m${i}`)));
    }
    const { messages } = doc.getRoot();
    expect(messages).toHaveLength(messagesMax);
    expect(messages[0].id).toBe('m1');
  });
});

describe('toggleReaction', () => {
  it('counts each person once and keeps an emptied emoji', () => {
    const doc = channelDoc();
    const count = () =>
      Object.keys(doc.getRoot().messages[0].reactions['👍'] ?? {}).length;

    doc.update((root) => toggleReaction(root, 'm1', '👍', 'u1'));
    doc.update((root) => toggleReaction(root, 'm1', '👍', 'u2'));
    expect(count()).toBe(2);

    doc.update((root) => toggleReaction(root, 'm1', '👍', 'u1'));
    expect(count()).toBe(1);

    doc.update((root) => toggleReaction(root, 'm1', '👍', 'u2'));
    expect(count()).toBe(0);
    expect(doc.getRoot().messages[0].reactions['👍']).toEqual({});
  });

  it('ignores an emoji outside the set', () => {
    const doc = channelDoc();
    doc.update((root) => toggleReaction(root, 'm1', '🦄', 'u1'));
    expect(doc.getRoot().messages[0].reactions['🦄']).toBeUndefined();
  });
});

describe('addReply', () => {
  it('appends to the matching message only', () => {
    const doc = channelDoc();
    const { id, userId, name, color, text, at } = message('r1');
    const reply = { id, userId, name, color, text, at };

    doc.update((root) => addReply(root, 'm1', reply));
    doc.update((root) => addReply(root, 'missing', reply));

    expect(doc.getRoot().messages[0].replies).toHaveLength(1);
    expect(doc.getRoot().messages[0].replies[0].id).toBe('r1');
  });
});
