import { describe, bench } from 'vitest';
import { SplayNode, SplayTree } from '@yorkie-js/sdk/src/util/splay_tree';
import editTraceData from './editing-trace.json';

class StringNode extends SplayNode<string> {
  public removed: boolean = false;

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
    tree.findForText(Math.floor(Math.random() * i));
  }
};

const stressTest = (size: number) => {
  const tree = new SplayTree<string>();
  let treeSize = 1;
  for (let i = 0; i < size; i++) {
    const op = Math.floor(Math.random() * 3);
    if (op == 0) {
      const node = tree.findForText(Math.floor(Math.random() * treeSize))[0];
      if (node != undefined) {
        tree.insertAfter(node, StringNode.create('A'));
      } else {
        tree.insert(StringNode.create('A'));
      }
      treeSize++;
    } else if (op == 1) {
      tree.findForText(Math.floor(Math.random() * treeSize));
    } else {
      const node = tree.findForText(Math.floor(Math.random() * treeSize))[0];
      if (node != undefined) {
        tree.delete(node);
        treeSize--;
      }
    }
  }
};

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
    const editTrace = editTraceData as {
      edits: Array<Array<string | number>>;
      finalText: string;
    };
    for (const i of editTrace.edits) {
      if (i[0] == 0 && i[0] != undefined) {
        const node = tree.findForText(i[1] as number)[0];
        if (node) {
          tree.insertAfter(node, StringNode.create(i[2] as string));
        }
      } else if (i[0] == 1) {
        const nodeToDelete = tree.findForText(i[1] as number)[0];
        if (nodeToDelete) {
          tree.delete(nodeToDelete);
        }
      }
    }
  });
});
