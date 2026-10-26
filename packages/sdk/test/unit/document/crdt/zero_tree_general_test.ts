/**
 * 일반 용도 검토용 시험 (커밋하지 않음): ZeroTree 를 Zero 가 아닌
 * ProseMirror basic + list 모양 스키마로 써 본다.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { Document, Indexable } from '@yorkie-js/sdk/src/document/document';
import { converter } from '@yorkie-js/sdk/src/api/converter';
import { ChangePack } from '@yorkie-js/sdk/src/document/change/change_pack';
import { Checkpoint } from '@yorkie-js/sdk/src/document/change/checkpoint';
import { CRDTObject } from '@yorkie-js/sdk/src/document/crdt/object';
import { RestoreRemovedByCapability } from '@yorkie-js/sdk/src/document/operation/edit_operation';
import { InitialVersionVector } from '@yorkie-js/sdk/src/document/time/version_vector';
import { ZeroTree } from '@yorkie-js/sdk/src/document/json/zero_tree';
import {
  applyZeroOperation,
  configureZeroSchema,
  DefaultZeroSchema,
  cloneZeroSchema,
} from '@yorkie-js/sdk/src/document/crdt/zero_tree_view';
import type {
  ZeroNodeJSON,
  ZeroSchema,
  ZeroOperation,
} from '@yorkie-js/sdk/src/document/crdt/zero_tree_view';
import type { CRDTZeroTree } from '@yorkie-js/sdk/src/document/crdt/zero_tree';

import { appendFileSync } from 'fs';
const note = (...args: Array<unknown>) =>
  appendFileSync(
    process.env.ZT_LOG ?? '/dev/null',
    args.map(String).join(' ') + '\n',
  );
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
}
function ack(doc: Document<Root>): void {
  const changes = doc.createChangePack().getChanges();
  const lastSeq = changes.length
    ? changes[changes.length - 1].getID().getClientSeq()
    : 0;
  doc.applyChangePack(
    ChangePack.create(
      doc.getKey(),
      Checkpoint.of(0n, lastSeq),
      false,
      [],
      InitialVersionVector,
      undefined,
      0n,
      capable,
    ),
  );
}
function exchange(a: Document<Root>, b: Document<Root>): void {
  send(a, b);
  send(b, a);
  ack(a);
  ack(b);
}

// ProseMirror basic + list 를 ZeroSchema 로 옮긴 것.
// - PM 의 text 노드(마크 포함) = 텍스트 타입 `text`, 마크는 style.*
// - PM attrs = attribute.*
const PM: ZeroSchema = {
  textType: 'text',
  textTypes: new Set(['text']),
  scoped: new Set(),
  single: undefined,
  grid: undefined,
  rootType: 'doc',
  atomic: new Set(['image', 'hard_break', 'horizontal_rule']),
  defaultChild: {
    // PM paragraph 는 inline* 이라 필수 자식이 없다: 빈 문단은 자식 0개.
    blockquote: 'paragraph',
    bullet_list: 'list_item',
    ordered_list: 'list_item',
    list_item: 'paragraph',
  },
  allowed: {
    doc: new Set([
      'paragraph',
      'heading',
      'blockquote',
      'bullet_list',
      'ordered_list',
      'code_block',
      'horizontal_rule',
    ]),
    paragraph: new Set(['text', 'image', 'hard_break']),
    heading: new Set(['text', 'image', 'hard_break']),
    code_block: new Set(['text']),
    blockquote: new Set([
      'paragraph',
      'heading',
      'blockquote',
      'bullet_list',
      'ordered_list',
      'code_block',
      'horizontal_rule',
    ]),
    bullet_list: new Set(['list_item']),
    ordered_list: new Set(['list_item']),
    list_item: new Set([
      'paragraph',
      'heading',
      'blockquote',
      'bullet_list',
      'ordered_list',
      'code_block',
    ]),
  },
};

const t = (text: string, style?: Record<string, unknown>): ZeroNodeJSON =>
  style ? { type: 'text', data: text, style } : { type: 'text', data: text };
const p = (...children: Array<ZeroNodeJSON>): ZeroNodeJSON => ({
  type: 'paragraph',
  children,
});
const li = (...children: Array<ZeroNodeJSON>): ZeroNodeJSON => ({
  type: 'list_item',
  children,
});
const ul = (...children: Array<ZeroNodeJSON>): ZeroNodeJSON => ({
  type: 'bullet_list',
  children,
});
const doc = (...children: Array<ZeroNodeJSON>): ZeroNodeJSON => ({
  type: 'doc',
  children,
});

let seq = 0;
function replicas(init: ZeroNodeJSON): [Document<Root>, Document<Root>] {
  seq++;
  const a = new Document<Root>(`g-${seq}`);
  const b = new Document<Root>(`g-${seq}`);
  a.setActor('000000000000000000000001');
  b.setActor('000000000000000000000002');
  a.update((root) => {
    root.zt = new ZeroTree(init as never);
  });
  exchange(a, b);
  return [a, b];
}
const model = (d: Document<Root>) => d.getRoot().zt.toZeroContent();
const xml = (d: Document<Root>) => d.getRoot().zt.toXML();
const ops = (d: Document<Root>, list: Array<ZeroOperation>) =>
  d.update((root) => root.zt.applyZeroOperations(list));
const crdtOf = (d: Document<Root>) =>
  (d.getRootObject() as CRDTObject).get('zt') as unknown as CRDTZeroTree;

/** 원격으로 받은 zero-tree 이벤트의 연산 목록을 모은다. */
function recordRemote(d: Document<Root>): Array<ZeroOperation> {
  const got: Array<ZeroOperation> = [];
  d.subscribe((event) => {
    if (event.type !== 'remote-change') return;
    for (const info of event.value.operations) {
      if ((info as any).type === 'zero-tree') {
        got.push(...(info as any).operations);
      }
    }
  });
  return got;
}

const saved = cloneZeroSchema(DefaultZeroSchema);

describe('ZeroTree 일반 용도 (ProseMirror basic+list 모양)', () => {
  beforeAll(() => {
    configureZeroSchema(PM);
  });

  it('G1 스키마: configureZeroSchema 뒤 만든 트리는 PM 스키마를 문서 상태로 갖는다', () => {
    const [a, b] = replicas(doc(p(t('hello'))));
    expect(model(a)).toEqual(doc(p(t('hello'))));
    expect(crdtOf(b).getSchema().rootType).toBe('doc');
    // 빈 문단: defaultChild 가 없으니 자식 0개 (PM 과 같다)
    ops(a, [['delete', [0, 0], 1]]);
    exchange(a, b);
    expect(model(b)).toEqual(doc(p()));
    // 빈 문단에 타이핑: 텍스트 노드가 새로 생긴다
    ops(b, [['insert', [0, 0], 'x']]);
    exchange(a, b);
    expect(model(a)).toEqual(doc(p(t('x'))));
  });

  it('G2 스키마: configureZeroSchema 는 Partial 병합이라 이전 설정 키가 남는다', () => {
    const before = cloneZeroSchema(DefaultZeroSchema);
    configureZeroSchema({ rootType: 'root2' });
    // allowed/defaultChild 등은 PM 그대로 남고 rootType 만 바뀐다
    expect(DefaultZeroSchema.allowed.doc).toBeDefined();
    expect(DefaultZeroSchema.rootType).toBe('root2');
    // Zero 기본값에서 PM 으로 바꿀 때 grid/scoped 를 명시하지 않으면
    // Zero 의 table 규칙이 남는다
    configureZeroSchema(saved);
    configureZeroSchema({ ...PM, grid: undefined } as any);
    expect(DefaultZeroSchema.grid).toBeUndefined();
    configureZeroSchema(saved);
    const partial: Partial<ZeroSchema> = { ...PM };
    delete partial.grid;
    delete partial.scoped;
    configureZeroSchema(partial);
    expect(DefaultZeroSchema.grid?.table).toBe('table');
    expect([...DefaultZeroSchema.scoped]).toContain('table');
    configureZeroSchema(before);
  });

  it('G3 스키마: 한 프로세스에서 두 스키마 — 만들 때 복사하므로 이미 만든 트리는 유지', () => {
    const [a] = replicas(doc(p(t('x'))));
    configureZeroSchema(saved); // Zero 스키마로 바꿈
    const z = new Document<Root>('zero-doc');
    z.update((root) => {
      root.zt = new ZeroTree({
        type: 'content',
        children: [
          { type: 'paragraph', children: [{ type: 'inline-text', data: 'z' }] },
        ],
      } as never);
    });
    expect(crdtOf(z).getSchema().rootType).toBe('content');
    expect(crdtOf(a).getSchema().rootType).toBe('doc');
    ops(a, [['insert', [0, 0, 1], 'y']]);
    expect(model(a)).toEqual(doc(p(t('xy'))));
    configureZeroSchema(PM);
  });

  it('G4 노드 JSON: style/attribute/data 밖의 키(PM 의 attrs, marks)는 조용히 버려진다', () => {
    const [a] = replicas(doc(p(t('x'))));
    ops(a, [
      [
        'insert',
        [1],
        [
          {
            type: 'heading',
            attrs: { level: 2 },
            children: [
              { type: 'text', data: 'H', marks: [{ type: 'strong' }] },
            ],
          } as any,
        ],
      ],
    ]);
    expect(model(a).children![1]).toEqual({
      type: 'heading',
      children: [{ type: 'text', data: 'H' }],
    });
    // attribute.* 로 옮겨 주면 보존된다
    ops(a, [
      [
        'insert',
        [2],
        [{ type: 'heading', attribute: { level: 2 }, children: [t('H2')] }],
      ],
    ]);
    expect(model(a).children![2].attribute).toEqual({ level: 2 });
  });

  it('G5 Enter·동시 Enter: 같은 자리 동시 Enter 는 한 줄로 합쳐진다 (정책 고정)', () => {
    const [a, b] = replicas(doc(p(t('abcd'))));
    const enter: Array<ZeroOperation> = [
      ['split', [0, 0, 2]],
      ['split', [0, 1]],
    ];
    ops(a, enter);
    ops(b, enter);
    exchange(a, b);
    expect(model(a)).toEqual(model(b));
    // 일반 텍스트 CRDT(두 '\n')라면 문단 3개; 여기서는 2개
    expect(model(a).children!.length).toBe(2);
  });

  it('G6 리스트: 항목 안 Enter (3단 split) 와 동시 Enter 수렴', () => {
    const [a, b] = replicas(doc(ul(li(p(t('abcd'))))));
    // PM splitListItem: text → paragraph → list_item
    ops(a, [
      ['split', [0, 0, 0, 0, 2]],
      ['split', [0, 0, 0, 1]],
      ['split', [0, 0, 1]],
    ]);
    ops(b, [
      ['split', [0, 0, 0, 0, 3]],
      ['split', [0, 0, 0, 1]],
      ['split', [0, 0, 1]],
    ]);
    exchange(a, b);
    expect(model(a)).toEqual(model(b));
    expect(xml(a)).toBe(
      '<doc><bullet_list><list_item><paragraph><text>ab</text></paragraph></list_item>' +
        '<list_item><paragraph><text>c</text></paragraph></list_item>' +
        '<list_item><paragraph><text>d</text></paragraph></list_item></bullet_list></doc>',
    );
  });

  it('G7 마크: 동시에 겹치는 두 범위 서식 — 상대가 나눈 조각에도 서식이 번진다', () => {
    const [a, b] = replicas(doc(p(t('abcdef'))));
    // A: [1,4) bold — 경계 split 둘 + 가운데 update
    ops(a, [
      ['split', [0, 0, 4]],
      ['split', [0, 0, 1]],
      ['update', [0, 1], { style: { bold: true } }],
    ]);
    // B: [2,5) italic
    ops(b, [
      ['split', [0, 0, 5]],
      ['split', [0, 0, 2]],
      ['update', [0, 1], { style: { italic: true } }],
    ]);
    exchange(a, b);
    expect(model(a)).toEqual(model(b));
    const runs = (model(a).children![0].children ?? []).map(
      (c) =>
        `${c.data}:${Object.keys(c.style ?? {})
          .sort()
          .join('+')}`,
    );
    // 의도: a, b(bold), cd(bold+italic), e(italic), f
    // (범위 서식 전에는 cd 가 italic 만, e 는 서식 없음)
    expect(runs).toEqual(['a:', 'b:bold', 'cd:bold+italic', 'e:italic', 'f:']);
  });

  it('G8 마크: 범위 서식 ∥ 그 범위 안 타이핑 — 타이핑한 글자는 서식을 받는다', () => {
    const [a, b] = replicas(doc(p(t('abcdef'))));
    ops(a, [
      ['split', [0, 0, 4]],
      ['split', [0, 0, 1]],
      ['update', [0, 1], { style: { bold: true } }],
    ]);
    ops(b, [['insert', [0, 0, 3], 'X']]);
    exchange(a, b);
    expect(model(a)).toEqual(model(b));
    expect(model(a).children![0].children).toEqual([
      t('a'),
      t('bcXd', { bold: true }),
      t('ef'),
    ]);
  });

  it('G9 모델 비정규화: 같은 서식 이웃 텍스트·빈 텍스트가 남아 PM 의 정규화 모델과 경로가 다르다', () => {
    const [a] = replicas(doc(p(t('abcd'))));
    ops(a, [
      ['split', [0, 0, 2]],
      ['update', [0, 1], { style: { bold: true } }],
      ['update', [0, 1], { style: { bold: null } }],
    ]);
    // PM 이라면 text "abcd" 하나. ZeroTree 는 둘.
    expect(model(a).children![0].children).toEqual([t('ab'), t('cd')]);
    // PM 위치(문단 안 offset 3)를 PM 모델 기준 경로 [0,0,3] 으로 보내면
    // ZeroTree 는 첫 텍스트 노드 끝(2)에 clamp 한다 → 'abXcd' (의도 'abcXd')
    ops(a, [['insert', [0, 0, 3], 'X']]);
    expect(model(a).children![0].children).toEqual([t('abX'), t('cd')]);
  });

  it('G9r 리치 보기: 정규화된 모델과 그 경로로 넣으면 의도한 자리에 들어간다', () => {
    const [a] = replicas(doc(p(t('abcd'))));
    ops(a, [
      ['split', [0, 0, 2]],
      ['update', [0, 1], { style: { bold: true } }],
      ['update', [0, 1], { style: { bold: null } }],
      ['split', [0, 1, 2]],
    ]);
    // Zero 모델에는 경계와 빈 텍스트가 남지만, 리치 보기는 하나다
    expect(model(a).children![0].children).toEqual([t('ab'), t('cd'), t('')]);
    expect(a.getRoot().zt.toRichContent().children![0].children).toEqual([
      t('abcd'),
    ]);
    a.update((root) =>
      root.zt.applyRichOperations([['insert', [0, 0, 3], 'X']]),
    );
    expect(a.getRoot().zt.toRichContent().children![0].children).toEqual([
      t('abcXd'),
    ]);
    // 두 Zero 노드에 걸친 지우기
    a.update((root) => root.zt.applyRichOperations([['delete', [0, 0, 1], 2]]));
    expect(a.getRoot().zt.toRichContent().children![0].children).toEqual([
      t('aXd'),
    ]);
  });

  it('G7r 리치 보기: 겹치는 동시 범위 서식(format)이 둘 다 남는다', () => {
    const [a, b] = replicas(doc(p(t('abcdef'))));
    a.update((root) =>
      root.zt.applyRichOperations([
        ['format', [0], { from: 1, to: 4, style: { bold: true } }],
      ]),
    );
    b.update((root) =>
      root.zt.applyRichOperations([
        ['format', [0], { from: 2, to: 5, style: { italic: true } }],
      ]),
    );
    exchange(a, b);
    expect(model(a)).toEqual(model(b));
    expect(a.getRoot().zt.toRichContent().children![0].children).toEqual([
      t('a'),
      t('b', { bold: true }),
      t('cd', { bold: true, italic: true }),
      t('e', { italic: true }),
      t('f'),
    ]);
  });

  it('G10 블록 타입 변경 (paragraph → heading) ∥ 같은 문단 타이핑', () => {
    const [a, b] = replicas(doc(p(t('abcd')), p(t('next'))));
    const remoteA = recordRemote(a);
    // type 은 LWW 속성이 아니므로 delete + insert 로만 표현된다
    ops(a, [
      ['delete', [0], 1],
      [
        'insert',
        [0],
        [{ type: 'heading', attribute: { level: 1 }, children: [t('abcd')] }],
      ],
    ]);
    ops(b, [['insert', [0, 0, 4], 'XY']]);
    exchange(a, b);
    expect(model(a)).toEqual(model(b));
    // B 의 'XY' 는 살아남지만 heading 이 아니라 다른 곳에 붙는다
    const text = xml(a);
    expect(text).toContain('XY');
    // 끝에 친 글은 우연히 새 heading 끝에 붙는다 (사본이 묘비 앞에 들어가서)
    expect(text).toContain('<heading attribute.level="1"><text>abcdXY</text>');
    // 기록: 실제 결과와 A 가 받은 원격 연산
    note('G10', text, JSON.stringify(remoteA));
  });

  it('G11 들여쓰기 (항목을 앞 항목의 하위 리스트로) ∥ 그 항목 타이핑', () => {
    const [a, b] = replicas(doc(ul(li(p(t('one'))), li(p(t('two'))))));
    // sinkListItem: 깊이가 바뀌므로 delete + insert
    ops(a, [
      ['delete', [0, 1], 1],
      ['insert', [0, 0, 1], [ul(li(p(t('two'))))]],
    ]);
    ops(b, [['insert', [0, 1, 0, 0, 3], '!']]);
    exchange(a, b);
    expect(model(a)).toEqual(model(b));
    const text = xml(a);
    note('G11', text);
    // 끝에 친 글은 사본 끝에 붙는다
    expect(text).toContain('<text>two!</text>');
  });

  it.each([
    ['가운데 타이핑', [['insert', [0, 0, 2], 'XY']], 'abXYcd'],
    ['글자 삭제', [['delete', [0, 0, 1], 1]], 'acd'],
    [
      '서식',
      [
        ['split', [0, 0, 2]],
        ['update', [0, 1], { style: { bold: true } }],
      ],
      'ab|cd(bold)',
    ],
  ])('G10b 블록 타입 변경 ∥ %s', (_, bOps, intended) => {
    const [a, b] = replicas(doc(p(t('zz')), p(t('abcd'))));
    ops(a, [
      ['delete', [1], 1],
      [
        'insert',
        [1],
        [{ type: 'heading', attribute: { level: 1 }, children: [t('abcd')] }],
      ],
    ]);
    ops(
      b,
      (bOps as Array<ZeroOperation>).map(
        ([k, path, d]) => [k, [1, ...path.slice(1)], d] as ZeroOperation,
      ),
    );
    exchange(a, b);
    expect(model(a)).toEqual(model(b));
    note('G10b', _, '의도:', intended, '실제:', xml(a));
  });

  it('G11b 들여쓰기 ∥ 가운데 타이핑 / 글자 삭제', () => {
    for (const [name, bOps] of [
      ['가운데', [['insert', [0, 1, 0, 0, 1], '!']]],
      ['삭제', [['delete', [0, 1, 0, 0, 0], 1]]],
    ] as Array<[string, Array<ZeroOperation>]>) {
      const [a, b] = replicas(doc(ul(li(p(t('one'))), li(p(t('two'))))));
      ops(a, [
        ['delete', [0, 1], 1],
        ['insert', [0, 0, 1], [ul(li(p(t('two'))))]],
      ]);
      ops(b, bOps);
      exchange(a, b);
      expect(model(a)).toEqual(model(b));
      note('G11b', name, xml(a));
    }
  });

  it('G16 동시 블록 이동(드래그) ∥ 이동한 블록 안 타이핑', () => {
    const [a, b] = replicas(doc(p(t('one')), p(t('two')), p(t('three'))));
    // 블록 이동도 delete + insert 뿐
    ops(a, [
      ['delete', [2], 1],
      ['insert', [0], [p(t('three'))]],
    ]);
    ops(b, [['insert', [2, 0, 2], '#']]);
    exchange(a, b);
    expect(model(a)).toEqual(model(b));
    note('G16', xml(a));
  });

  it('G12 서로 다른 타입 merge (heading 뒤 paragraph Backspace)', () => {
    const [a, b] = replicas(
      doc(
        { type: 'heading', attribute: { level: 1 }, children: [t('H')] },
        p(t('body')),
      ),
    );
    const remoteB = recordRemote(b);
    ops(a, [['merge', [1]]]);
    exchange(a, b);
    expect(model(a)).toEqual(model(b));
    expect(xml(a)).toBe(
      '<doc><heading attribute.level="1"><text>H</text><text>body</text></heading></doc>',
    );
    // 받는 쪽 이벤트: Zero 적용기는 다른 타입 merge 를 거부하므로 merge 가
    // 아닌 다른 연산으로 나온다
    note('G12', JSON.stringify(remoteB));
    expect(remoteB.some((o) => o[0] === 'merge')).toBe(false);
  });

  it('G13 되돌리기: 항목 삭제 되돌리기 ∥ 다른 항목 타이핑', () => {
    const [a, b] = replicas(doc(ul(li(p(t('one'))), li(p(t('two'))))));
    ops(a, [['delete', [0, 1], 1]]);
    exchange(a, b);
    ops(b, [['insert', [0, 0, 0, 0, 3], '1']]);
    a.history.undo();
    exchange(a, b);
    expect(model(a)).toEqual(model(b));
    expect(model(a)).toEqual(doc(ul(li(p(t('one1'))), li(p(t('two'))))));
  });

  it('G14 원격 이벤트 = 받는 쪽 모델 전후를 잇는 연산 (PM 스키마에서도 성립)', () => {
    const [a, b] = replicas(doc(p(t('abcdef')), ul(li(p(t('x'))))));
    const got = recordRemote(b);
    const before = JSON.parse(JSON.stringify(model(b)));
    ops(a, [
      ['split', [0, 0, 3]],
      ['split', [0, 1]],
      ['insert', [1, 0, 0], 'Q'],
      ['update', [1, 0], { style: { bold: true } }],
      ['merge', [1]],
      ['insert', [1, 1], [li(p(t('y')))]],
    ]);
    exchange(a, b);
    expect(model(a)).toEqual(model(b));
    // got 을 before 에 Zero 의미로 적용하면 b 의 모델이 되어야 한다
    const replay = JSON.parse(JSON.stringify(before));
    for (const o of got) applyZeroOperation(replay, o, crdtOf(b).getSchema());
    expect(replay).toEqual(model(b));
    expect(got.length).toBeGreaterThan(0);
    note('G14', JSON.stringify(before), JSON.stringify(got));
  });

  it('G15 성능: 큰 문서에서 글자 하나 넣기 (로컬·원격)', () => {
    const N = Number(process.env.ZT_N ?? 500);
    const paras = Array.from({ length: N }, (_, i) =>
      p(t(`paragraph ${i} `.padEnd(60, 'x'))),
    );
    const [a, b] = replicas(doc(...paras));
    const at = Math.floor(N / 2);
    const t0 = performance.now();
    const K = 20;
    for (let k = 0; k < K; k++) {
      ops(a, [['insert', [at, 0, 5], 'Z']]);
    }
    const local = (performance.now() - t0) / K;
    const t1 = performance.now();
    send(a, b);
    const remote = (performance.now() - t1) / K;
    ack(a);
    expect(model(a)).toEqual(model(b));
    note(
      `G15 N=${N} 문단 (~${N * 61} 토큰): 로컬 ${local.toFixed(1)}ms/글자, 원격 ${remote.toFixed(1)}ms/글자`,
    );
  });
});
