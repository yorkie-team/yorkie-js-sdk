// Concurrent splits of one place fold into one (`dealias`). When something
// lies between the folded markers -- a character typed there, another split --
// what each author put left of their split stays left, and what they wrote on
// the split's node stays on the characters after it.
import { describe, it, expect } from 'vitest';
import { Document, Indexable } from '@yorkie-js/sdk/src/document/document';
import { converter } from '@yorkie-js/sdk/src/api/converter';
import { ChangePack } from '@yorkie-js/sdk/src/document/change/change_pack';
import { Checkpoint } from '@yorkie-js/sdk/src/document/change/checkpoint';
import { RestoreRemovedByCapability } from '@yorkie-js/sdk/src/document/operation/edit_operation';
import { InitialVersionVector } from '@yorkie-js/sdk/src/document/time/version_vector';
import { ZeroTree } from '@yorkie-js/sdk/src/document/json/zero_tree';
import type { ZeroOperation } from '@yorkie-js/sdk/src/document/crdt/zero_tree_view';

type Root = { zt: ZeroTree };
const capable = [RestoreRemovedByCapability];

function send(from: Document<Root>, to: Document<Root>): void {
  const pack = converter.fromChangePack<Indexable>(
    converter.toChangePack(from.createChangePack()),
  );
  to.applyChangePack(
    ChangePack.create(
      pack.getDocumentKey(),
      Checkpoint.of(0n, 0),
      false,
      pack.getChanges() as never,
      InitialVersionVector,
      undefined,
      0n,
      capable,
    ),
  );
  const changes = from.createChangePack().getChanges();
  if (changes.length) {
    from.applyChangePack(
      ChangePack.create(
        from.getKey(),
        Checkpoint.of(0n, changes[changes.length - 1].getID().getClientSeq()),
        false,
        [],
        InitialVersionVector,
        undefined,
        0n,
        capable,
      ),
    );
  }
}

/** the first paragraph's text nodes as `text:style keys` */
function show(d: Document<Root>): string {
  return (d.getRoot().zt.toZeroContent().children![0].children ?? [])
    .map(
      (n) =>
        `${String(n.data ?? '')}:${Object.keys(n.style ?? {})
          .sort()
          .join('+')}`,
    )
    .join(' | ');
}

function setup(): [Document<Root>, Document<Root>] {
  const [a, b] = [1, 2].map((n) => {
    const d = new Document<Root>('dealias-fold');
    d.setActor(`00000000000000000000000${n}`);
    return d;
  });
  a.update((root) => {
    root.zt = new ZeroTree({
      type: 'content',
      children: [
        { type: 'paragraph', children: [{ type: 'inline-text', data: 'ab' }] },
      ],
    } as never);
  });
  send(a, b);
  return [a, b];
}

const ops = (d: Document<Root>, list: Array<ZeroOperation>) =>
  d.update((root) => root.zt.applyZeroOperations(list));

/** B splits "a|b" at a later ticket than all of A's edits, not knowing them */
function splitLater(b: Document<Root>): void {
  for (let i = 0; i < 10; i++) {
    b.update((root) => {
      (root as Record<string, unknown>).n = i;
    });
  }
  ops(b, [['split', [0, 0, 1]]]);
}

describe('ZeroTree dealias fold', () => {
  it('왼쪽 노드 끝에 친 글자는 같은 자리 동시 나누기에 흡수돼도 왼쪽에 남아야 한다', () => {
    const [a, b] = setup();
    // A: "a|b", bolds "b", then types "x" at the end of "a"
    ops(a, [
      ['split', [0, 0, 1]],
      ['update', [0, 1], { style: { bold: true } }],
    ]);
    ops(a, [['insert', [0, 0, 1], 'x']]);
    expect(show(a)).toBe('ax: | b:bold');
    splitLater(b);
    send(a, b);
    send(b, a);
    expect(show(b)).toBe(show(a));
    expect(show(a)).toBe('ax: | b:bold');
  });

  it('흡수된 나누기 앞 노드에 건 범위 서식은 그 노드 글자에만 남아야 한다', () => {
    const [a, b] = setup();
    ops(a, [
      ['split', [0, 0, 1]],
      ['update', [0, 1], { style: { bold: true } }],
    ]);
    ops(a, [['insert', [0, 0, 1], 'x']]);
    splitLater(b);
    send(a, b);
    send(b, a);
    expect(show(a)).toBe('ax: | b:bold');
    // A, knowing all, italicizes "ax": the range walks over B's folded split
    ops(a, [['update', [0, 0], { style: { italic: true } }]]);
    send(a, b);
    expect(show(b)).toBe(show(a));
    expect(show(a)).toBe('ax:italic | b:bold');
  });

  it('흡수된 나누기에 그 작성자가 건 서식은 나누기 뒤 글자에 남아야 한다', () => {
    const [a, b] = setup();
    // A: "a|b", then types "x" at the end of "a"
    ops(a, [['split', [0, 0, 1]]]);
    ops(a, [['insert', [0, 0, 1], 'x']]);
    // B, later and not knowing it: "a|b", bolds "b"
    for (let i = 0; i < 10; i++) {
      b.update((root) => {
        (root as Record<string, unknown>).n = i;
      });
    }
    ops(b, [
      ['split', [0, 0, 1]],
      ['update', [0, 1], { style: { bold: true } }],
    ]);
    send(a, b);
    send(b, a);
    expect(show(b)).toBe(show(a));
    expect(show(a)).toBe('ax: | b:bold');
  });

  it('흡수된 나누기 사이에 낀 나누기의 서식은 그 노드 글자에만 남아야 한다', () => {
    const [a, b] = setup();
    // A: "a|b", types "x" at the end of "a", splits "a|x" and bolds "x"
    ops(a, [['split', [0, 0, 1]]]);
    ops(a, [['insert', [0, 0, 1], 'x']]);
    ops(a, [
      ['split', [0, 0, 1]],
      ['update', [0, 1], { style: { bold: true } }],
    ]);
    expect(show(a)).toBe('a: | x:bold | b:');
    splitLater(b);
    send(a, b);
    send(b, a);
    expect(show(b)).toBe(show(a));
    expect(show(a)).toBe('a: | x:bold | b:');
  });
});
