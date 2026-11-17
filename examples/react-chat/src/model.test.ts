import { describe, expect, it } from 'vitest';
import { Document, type JSONArray } from '@yorkie-js/sdk';
import {
  addMessage,
  addReply,
  channelKey,
  type ChannelRoot,
  cleanText,
  makeUser,
  type Message,
  messagesMax,
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
    at: now.getTime(),
    reactions: {},
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

describe('seedRoot', () => {
  it('greets #general with what to try', () => {
    const { messages } = seedRoot('general', now);
    expect(messages).toHaveLength(1);
    expect(messages[0].userId).toBe('yorkie');
    expect(messages[0].color).toBe('orange');
    expect(messages[0].text).toMatch(/another pane/);
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
  it('counts each person once and removes an emptied emoji', () => {
    const doc = channelDoc();
    const count = () =>
      Object.keys(doc.getRoot().messages[0].reactions['👍'] ?? {}).length;

    doc.update((root) => toggleReaction(root, 'm1', '👍', 'u1'));
    doc.update((root) => toggleReaction(root, 'm1', '👍', 'u2'));
    expect(count()).toBe(2);

    doc.update((root) => toggleReaction(root, 'm1', '👍', 'u1'));
    expect(count()).toBe(1);

    doc.update((root) => toggleReaction(root, 'm1', '👍', 'u2'));
    expect(doc.getRoot().messages[0].reactions['👍']).toBeUndefined();
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
