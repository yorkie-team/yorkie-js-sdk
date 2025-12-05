import { describe, it, expect } from 'vitest';
import * as YSON from '@yorkie-js/sdk/src/document/yson';

describe('YSON Parser', () => {
  describe('parse', () => {
    it('should parse primitives', () => {
      expect(YSON.parse('"hello"')).toBe('hello');
      expect(YSON.parse('42')).toBe(42);
      expect(YSON.parse('true')).toBe(true);
      expect(YSON.parse('null')).toBe(null);
    });

    it('should parse arrays', () => {
      const result = YSON.parse('[1, 2, 3]');
      expect(result).toEqual([1, 2, 3]);
    });

    it('should parse plain objects', () => {
      const result = YSON.parse('{"name":"Alice","age":30}');
      expect(result).toEqual({ name: 'Alice', age: 30 });
    });

    it('should parse Text CRDT', () => {
      const yson = '{"content":Text([{"val":"H"},{"val":"i"}])}';
      const result = YSON.parse(yson);

      expect(YSON.isObject(result)).toBe(true);
      const obj = result as { content: YSON.YSONValue };
      expect(YSON.isText(obj.content)).toBe(true);

      if (YSON.isText(obj.content)) {
        expect(obj.content.type).toBe('Text');
        expect(obj.content.nodes).toHaveLength(2);
        expect(obj.content.nodes[0].val).toBe('H');
        expect(obj.content.nodes[1].val).toBe('i');
      }
    });

    it('should parse Text CRDT with attributes', () => {
      const yson = '{"content":Text([{"val":"H","attrs":{"bold":true}}])}';
      const result = YSON.parse(yson);
      const obj = result as { content: YSON.YSONValue };

      if (YSON.isText(obj.content)) {
        expect(obj.content.nodes[0].attrs).toEqual({ bold: true });
      }
    });

    it('should parse Tree CRDT', () => {
      const yson =
        '{"content":Tree({"type":"doc","children":[{"type":"p","children":[{"type":"text","value":"Hello"}]}]})}';
      const result = YSON.parse(yson);
      const obj = result as { content: YSON.YSONValue };

      expect(YSON.isTree(obj.content)).toBe(true);

      if (YSON.isTree(obj.content)) {
        expect(obj.content.type).toBe('Tree');
        expect(obj.content.root.type).toBe('doc');
        expect(obj.content.root.children).toHaveLength(1);
        expect(obj.content.root.children![0].type).toBe('p');
      }
    });

    it('should parse nested structures', () => {
      const yson = '{"users":[{"name":"Alice","content":Text([{"val":"A"}])}]}';
      const result = YSON.parse(yson);
      const obj = result as { users: Array<any> };

      expect(Array.isArray(obj.users)).toBe(true);
      expect(YSON.isText(obj.users[0].content)).toBe(true);
    });
  });

  describe('Type Guards', () => {
    it('isText should identify Text objects', () => {
      const text: YSON.Text = { type: 'Text', nodes: [{ val: 'H' }] };
      expect(YSON.isText(text)).toBe(true);
      expect(YSON.isText({ type: 'NotText' })).toBe(false);
      expect(YSON.isText('string')).toBe(false);
    });

    it('isTree should identify Tree objects', () => {
      const tree: YSON.Tree = {
        type: 'Tree',
        root: { type: 'doc', children: [] },
      };
      expect(YSON.isTree(tree)).toBe(true);
      expect(YSON.isTree({ type: 'NotTree' })).toBe(false);
    });

    it('isObject should identify plain objects', () => {
      expect(YSON.isObject({ name: 'Alice' })).toBe(true);
      expect(YSON.isObject({ type: 'Text', nodes: [] })).toBe(false);
      expect(YSON.isObject([1, 2, 3])).toBe(false);
    });
  });

  describe('Utility Functions', () => {
    it('textToString should extract text', () => {
      const text: YSON.Text = {
        type: 'Text',
        nodes: [
          { val: 'H' },
          { val: 'e' },
          { val: 'l' },
          { val: 'l' },
          { val: 'o' },
        ],
      };
      expect(YSON.textToString(text)).toBe('Hello');
    });

    it('textToString should handle empty text', () => {
      const text: YSON.Text = { type: 'Text', nodes: [] };
      expect(YSON.textToString(text)).toBe('');
    });

    it('treeToXML should convert tree to XML', () => {
      const tree: YSON.Tree = {
        type: 'Tree',
        root: {
          type: 'doc',
          children: [
            {
              type: 'p',
              attrs: { class: 'paragraph' },
              children: [{ type: 'text', value: 'Hello' }],
            },
          ],
        },
      };
      const xml = YSON.treeToXML(tree);
      expect(xml).toContain('<doc>');
      expect(xml).toContain('<p class="paragraph">');
      expect(xml).toContain('<text>Hello</text>');
    });
  });

  describe('Int Type', () => {
    it('should parse Int type', () => {
      const result = YSON.parse('{"value":Int(42)}');
      const obj = result as { value: YSON.YSONValue };

      expect(YSON.isInt(obj.value)).toBe(true);
      if (YSON.isInt(obj.value)) {
        expect(obj.value.type).toBe('Int');
        expect(obj.value.value).toBe(42);
      }
    });

    it('should parse negative Int', () => {
      const result = YSON.parse('{"value":Int(-42)}');
      const obj = result as { value: YSON.YSONValue };

      if (YSON.isInt(obj.value)) {
        expect(obj.value.value).toBe(-42);
      }
    });
  });

  describe('Long Type', () => {
    it('should parse Long type', () => {
      const result = YSON.parse('{"value":Long(64)}');
      const obj = result as { value: YSON.YSONValue };

      expect(YSON.isLong(obj.value)).toBe(true);
      if (YSON.isLong(obj.value)) {
        expect(obj.value.type).toBe('Long');
        expect(obj.value.value).toBe(64);
      }
    });
  });

  describe('Date Type', () => {
    it('should parse Date type', () => {
      const dateStr = '2025-01-02T15:04:05.058Z';
      const result = YSON.parse(`{"value":Date("${dateStr}")}`);
      const obj = result as { value: YSON.YSONValue };

      expect(YSON.isDate(obj.value)).toBe(true);
      if (YSON.isDate(obj.value)) {
        expect(obj.value.type).toBe('Date');
        expect(obj.value.value).toBe(dateStr);
      }
    });
  });

  describe('BinData Type', () => {
    it('should parse BinData type', () => {
      const result = YSON.parse('{"value":BinData("AQID")}');
      const obj = result as { value: YSON.YSONValue };

      expect(YSON.isBinData(obj.value)).toBe(true);
      if (YSON.isBinData(obj.value)) {
        expect(obj.value.type).toBe('BinData');
        expect(obj.value.value).toBe('AQID');
      }
    });
  });

  describe('Counter Type', () => {
    it('should parse Counter with Int', () => {
      const result = YSON.parse('{"value":Counter(Int(10))}');
      const obj = result as { value: YSON.YSONValue };

      expect(YSON.isCounter(obj.value)).toBe(true);
      if (YSON.isCounter(obj.value)) {
        expect(obj.value.type).toBe('Counter');
        expect(YSON.isInt(obj.value.value)).toBe(true);
        if (YSON.isInt(obj.value.value)) {
          expect(obj.value.value.value).toBe(10);
        }
      }
    });

    it('should parse Counter with Long', () => {
      const result = YSON.parse('{"value":Counter(Long(100))}');
      const obj = result as { value: YSON.YSONValue };

      if (YSON.isCounter(obj.value)) {
        expect(YSON.isLong(obj.value.value)).toBe(true);
        if (YSON.isLong(obj.value.value)) {
          expect(obj.value.value.value).toBe(100);
        }
      }
    });
  });

  describe('Complex Document', () => {
    it('should parse document with all types', () => {
      const yson = `{
        "str": "value1",
        "num": 42,
        "int": Int(42),
        "long": Long(64),
        "null": null,
        "bool": true,
        "bytes": BinData("AQID"),
        "date": Date("2025-01-02T15:04:05.058Z"),
        "counter": Counter(Int(10)),
        "text": Text([{"val":"Hello"}]),
        "tree": Tree({"type":"p","children":[{"type":"text","value":"Hello World"}]})
      }`;
      const result = YSON.parse(yson);

      expect(YSON.isObject(result)).toBe(true);
      const obj = result as any;
      expect(obj.str).toBe('value1');
      expect(obj.num).toBe(42);
      expect(YSON.isInt(obj.int)).toBe(true);
      expect(YSON.isLong(obj.long)).toBe(true);
      expect(obj.null).toBe(null);
      expect(obj.bool).toBe(true);
      expect(YSON.isBinData(obj.bytes)).toBe(true);
      expect(YSON.isDate(obj.date)).toBe(true);
      expect(YSON.isCounter(obj.counter)).toBe(true);
      expect(YSON.isText(obj.text)).toBe(true);
      expect(YSON.isTree(obj.tree)).toBe(true);
    });
  });

  describe('Type Parameter', () => {
    it('should infer type with type parameter', () => {
      interface DocType {
        content: YSON.Text;
        title: string;
      }

      const yson =
        '{"content":Text([{"val":"H"},{"val":"i"}]),"title":"Hello"}';
      const result = YSON.parse<DocType>(yson);

      // Type should be inferred as DocumentRoot
      expect(result.title).toBe('Hello');
      expect(result.content.type).toBe('Text');
      expect(result.content.nodes).toHaveLength(2);
    });

    it('should work with nested type parameter', () => {
      interface User {
        name: string;
        bio: YSON.Text;
      }

      interface Doc {
        users: Array<User>;
      }

      const yson = '{"users":[{"name":"Alice","bio":Text([{"val":"A"}])}]}';
      const result = YSON.parse<Doc>(yson);

      expect(result.users[0].name).toBe('Alice');
      expect(result.users[0].bio.type).toBe('Text');
      expect(result.users[0].bio.nodes[0].val).toBe('A');
    });

    it('should work with Tree type parameter', () => {
      interface TreeDoc {
        content: YSON.Tree;
      }

      const yson =
        '{"content":Tree({"type":"doc","children":[{"type":"p","children":[{"type":"text","value":"Hello"}]}]})}';
      const result = YSON.parse<TreeDoc>(yson);

      expect(result.content.type).toBe('Tree');
      expect(result.content.root.type).toBe('doc');
    });

    it('should work with mixed YSON types', () => {
      interface ComplexDoc {
        text: YSON.Text;
        tree: YSON.Tree;
        counter: YSON.Counter;
        timestamp: YSON.Date;
      }

      const yson = `{
        "text": Text([{"val":"H"}]),
        "tree": Tree({"type":"p","children":[]}),
        "counter": Counter(Int(10)),
        "timestamp": Date("2025-01-02T15:04:05.058Z")
      }`;
      const result = YSON.parse<ComplexDoc>(yson);

      expect(result.text.type).toBe('Text');
      expect(result.tree.type).toBe('Tree');
      expect(result.counter.type).toBe('Counter');
      expect(result.timestamp.type).toBe('Date');
    });

    it('should work without type parameter (default behavior)', () => {
      const yson = '{"content":Text([{"val":"H"}])}';
      const result = YSON.parse(yson);

      // Should still work but type is YSONValue
      expect(YSON.isObject(result)).toBe(true);
    });

    it('should handle primitive type parameter', () => {
      const numberYson = '42';
      const stringYson = '"hello"';
      const boolYson = 'true';

      const numResult = YSON.parse<number>(numberYson);
      const strResult = YSON.parse<string>(stringYson);
      const boolResult = YSON.parse<boolean>(boolYson);

      expect(numResult).toBe(42);
      expect(strResult).toBe('hello');
      expect(boolResult).toBe(true);
    });

    it('should handle array type parameter', () => {
      interface Item {
        id: number;
        text: YSON.Text;
      }

      const yson =
        '[{"id":1,"text":Text([{"val":"A"}])},{"id":2,"text":Text([{"val":"B"}])}]';
      const result = YSON.parse<Array<Item>>(yson);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe(1);
      expect(result[0].text.nodes[0].val).toBe('A');
      expect(result[1].id).toBe(2);
      expect(result[1].text.nodes[0].val).toBe('B');
    });

    it('should handle optional properties with type parameter', () => {
      interface Document {
        title: string;
        content?: YSON.Text;
        metadata?: {
          author: string;
        };
      }

      const yson1 = '{"title":"Doc1","content":Text([{"val":"A"}])}';
      const yson2 = '{"title":"Doc2"}';

      const result1 = YSON.parse<Document>(yson1);
      const result2 = YSON.parse<Document>(yson2);

      expect(result1.title).toBe('Doc1');
      expect(result1.content?.type).toBe('Text');
      expect(result2.title).toBe('Doc2');
      expect(result2.content).toBeUndefined();
    });
  });

  describe('Error Handling', () => {
    it('should throw on invalid JSON', () => {
      expect(() => YSON.parse('invalid json')).toThrow();
    });

    it('should throw on invalid Text format', () => {
      const invalidText = '{"content":Text([{"invalid":"node"}])}';
      expect(() => YSON.parse(invalidText)).toThrow();
    });

    it('should throw on invalid Tree format', () => {
      const invalidTree = '{"content":Tree({"invalid":"tree"})}';
      expect(() => YSON.parse(invalidTree)).toThrow();
    });
  });
});
