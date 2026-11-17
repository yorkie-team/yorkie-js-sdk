import { describe, expect, it } from 'vitest';
import { Document } from '@yorkie-js/sdk/src/document/document';
import { OpSource } from '@yorkie-js/sdk/src/document/operation/operation';
import { type ChannelRoot, seedRoot, toggleReaction } from './model';

// Two replicas exchanging changes directly, without a server, the way the
// SDK's own unit tests do: what each pane would end up with after sync.
function replicas() {
  const a = new Document<ChannelRoot>('merge');
  const b = new Document<ChannelRoot>('merge');
  a.setActor('000000000000000000000001');
  b.setActor('000000000000000000000002');
  const sent = new Map<Document<ChannelRoot>, number>();
  const send = (from: Document<ChannelRoot>, to: Document<ChannelRoot>) => {
    const changes = from.createChangePack().getChanges();
    to.applyChanges(changes.slice(sent.get(from) ?? 0), OpSource.Remote);
    sent.set(from, changes.length);
  };
  a.update((root) => {
    root.messages = seedRoot('general', new Date()).messages;
  });
  send(a, b);
  return { a, b, sync: () => (send(a, b), send(b, a)) };
}

const count = (doc: Document<ChannelRoot>) =>
  Object.keys(doc.getRoot().messages[0].reactions['👍']).length;

describe('reactions across two panes', () => {
  it('counts two first reactions made at the same time', () => {
    const { a, b, sync } = replicas();
    a.update((root) => toggleReaction(root, 'seed-general', '👍', 'ari'));
    b.update((root) => toggleReaction(root, 'seed-general', '👍', 'ben'));
    sync();
    expect(count(a)).toBe(2);
    expect(count(b)).toBe(2);
  });

  it('keeps a reaction added while another is removed', () => {
    const { a, b, sync } = replicas();
    a.update((root) => toggleReaction(root, 'seed-general', '👍', 'ari'));
    sync();
    a.update((root) => toggleReaction(root, 'seed-general', '👍', 'ari'));
    b.update((root) => toggleReaction(root, 'seed-general', '👍', 'ben'));
    sync();
    expect(a.getRoot().messages[0].reactions['👍']).toEqual({ ben: true });
    expect(b.getRoot().messages[0].reactions['👍']).toEqual({ ben: true });
  });
});
