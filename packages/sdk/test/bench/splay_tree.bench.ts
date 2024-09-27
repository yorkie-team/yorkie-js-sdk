import { describe, bench } from 'vitest';
import { SplayNode, SplayTree } from '@yorkie-js-sdk/src/util/splay_tree';
import editTraceData from './editing-trace.json';

class StringNode extends SplayNode<string> {
  public removed: Boolean = false;
  constructor(value: string) {
    super(value);
  }

  public static create(value: string): StringNode {
    return new StringNode(value);
  }

  public getLength(): number {
    if (this.removed) {
      return 0;
    }
    return this.value.length;
  }
}

const benchmarkRandomAccess = (size: number) => {
  const tree = new SplayTree<string>();
  for (let i = 0; i < size; i++) {
    tree.insert(StringNode.create('A'));
  }
  for (let i = 0; i < 1000; i++) {
    tree.find(Math.floor(Math.random() * i));
  }
};

const stressTest = (size: number) => {
  const tree = new SplayTree<string>();
  let treeSize = 1;
  for (let i = 0; i < size; i++) {
    const op = Math.floor(Math.random() * 3);
    if (op == 0) {
      const node = tree.find(Math.floor(Math.random() * treeSize))[0];
      if (node != undefined) {
        tree.insertAfter(node, StringNode.create('A'));
      } else {
        tree.insert(StringNode.create('A'));
      }
      treeSize++;
    } else if (op == 1) {
      tree.find(Math.floor(Math.random() * treeSize));
    } else {
      const node = tree.find(Math.floor(Math.random() * treeSize))[0];
      if (node != undefined) {
        tree.delete(node);
        treeSize--;
      }
    }
  }
};

interface edit_operation {
  cursor: number;
  opeator: number;
  operand?: string;
}

describe('splay_tree.edit', () => {
  bench('splay_tree.stress 10000', () => {
    stressTest(10000);
  });
  bench('splay_tree.stress 20000', () => {
    stressTest(20000);
  });
  bench('splay_tree.stress 30000', () => {
    stressTest(30000);
  });

  bench('splay_tree.random_access 10000', () => {
    benchmarkRandomAccess(10000);
  });
  bench('splay_tree.random_access 20000', () => {
    benchmarkRandomAccess(20000);
  });
  bench('splay_tree.random_access 30000', () => {
    benchmarkRandomAccess(30000);
  });

  bench('editing-trace', () => {
    const tree = new SplayTree<string>();
    const editTrace = editTraceData as { edits: Array<edit_operation> };
    for (const i of editTrace.edits) {
      if (i.opeator == 0 && i.operand != undefined) {
        tree.insertAfter(tree.find(i.cursor)[0]!, StringNode.create(i.operand));
      } else if (i.opeator == 1) {
        tree.delete(tree.find(i.cursor)[0]!);
      }
    }
  });
});
