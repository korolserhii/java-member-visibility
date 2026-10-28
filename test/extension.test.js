'use strict';
// Tests the extension wiring without running VS Code: a minimal fake `vscode` module and symbols shaped
// like the Java language server returns them (range includes annotations/javadoc, selectionRange is the name).
const test = require('node:test');
const assert = require('node:assert');
const Module = require('module');

class Position {
  constructor(line, character) { this.line = line; this.character = character; }
  isBefore(o) { return this.line < o.line || (this.line === o.line && this.character < o.character); }
}
class Range { constructor(s, e) { this.start = s; this.end = e; } }
const SymbolKind = { Class: 4, Method: 5, Property: 6, Field: 7, Constructor: 8, Enum: 9, Interface: 10, Function: 11, Constant: 13, Struct: 22, EnumMember: 21 };
class TreeItem { constructor(label, state) { this.label = label; this.collapsibleState = state; } }
const fake = {
  Position, Range, SymbolKind, TreeItem,
  TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
  ThemeIcon: class { constructor(id, color) { this.id = id; this.color = color; } },
  ThemeColor: class { constructor(id) { this.id = id; } },
  MarkdownString: class { constructor() { this.value = ''; } appendMarkdown(s) { this.value += s; } appendCodeblock(s) { this.value += s; } },
  EventEmitter: class { constructor() { this.event = () => {}; } fire() {} },
  workspace: { getConfiguration: () => ({ get: (k, d) => (k === 'filter' ? test.filter || d : d) }) },
};
const orig = Module._load;
Module._load = function (req, ...rest) { return req === 'vscode' ? fake : orig.call(this, req, ...rest); };
const ext = require('../extension.js');
Module._load = orig;

const SRC = `package demo;

/** Service. */
public class OrderService {
    /** the repo; private by design */
    private final Repo repository;
    int counter, total;

    public OrderService(Repo r) { this.repository = r; }

    @Override
    @SuppressWarnings(value = "public")
    protected void validate(Order o) {}

    void notifyWarehouse(Order o) {}

    interface Listener {
        void onOrder(Order o);
    }

    enum State {
        NEW, PAID;
        State() {}
    }
}
`;
const lines = SRC.split('\n');
const doc = {
  getText(r) {
    const out = [];
    for (let l = r.start.line; l <= r.end.line; l++) {
      const s = l === r.start.line ? r.start.character : 0;
      const e = l === r.end.line ? r.end.character : lines[l].length;
      out.push(lines[l].slice(s, e));
    }
    return out.join('\n');
  },
};
function find(name, from = 0) {
  for (let l = from; l < lines.length; l++) {
    const m = new RegExp(`\\b${name}\\b`).exec(lines[l]);
    if (m) return new Position(l, m.index);
  }
  throw new Error(name);
}
function sym(name, kind, declLine, from, children = []) {
  const p = find(name, from);
  return { name, kind, range: new Range(new Position(declLine, 4), p), selectionRange: new Range(p, p), children };
}

const S = SymbolKind;
const symbols = [sym('OrderService', S.Class, 2, 0, [
  sym('repository', S.Field, 4, 5),
  sym('counter', S.Field, 6, 6),
  sym('total', S.Field, 6, 6),
  sym('OrderService', S.Constructor, 8, 7),
  sym('validate', S.Method, 10, 10),
  sym('notifyWarehouse', S.Method, 14, 14),
  sym('Listener', S.Interface, 16, 16, [sym('onOrder', S.Method, 17, 17)]),
  sym('State', S.Enum, 20, 20, [sym('NEW', S.EnumMember, 21, 21), sym('PAID', S.EnumMember, 21, 21), sym('State', S.Constructor, 22, 22)]),
])];

test('member visibility in a real file', () => {
  const roots = ext._build(doc, symbols, null);
  const cls = roots[0];
  const by = Object.fromEntries(cls.children.map((n) => [n.sym.name + ':' + n.kind, n]));
  assert.equal(cls.info.visibility, 'public');
  assert.equal(by['repository:field'].info.visibility, 'private');
  assert.deepEqual(by['repository:field'].info.modifiers, ['final']);
  assert.equal(by['counter:field'].info.visibility, 'package');
  assert.equal(by['total:field'].info.visibility, 'package');
  assert.equal(by['OrderService:constructor'].info.visibility, 'public');
  assert.equal(by['validate:method'].info.visibility, 'protected');
  assert.equal(by['notifyWarehouse:method'].info.visibility, 'package');
  const lst = by['Listener:type'];
  assert.equal(lst.typeKind, 'interface');
  assert.equal(lst.children[0].info.visibility, 'public');
  assert.equal(lst.children[0].info.implicit, true);
  const st = by['State:type'];
  assert.equal(st.typeKind, 'enum');
  assert.deepEqual(st.children.map((n) => n.info.visibility), ['public', 'public', 'private']);
});

test('tree item, filter and summary', () => {
  const p = new ext._Provider();
  p.roots = ext._build(doc, symbols, null);
  const item = p.getTreeItem(p.roots[0].children[0]);
  assert.match(item.description, /^− private · final$/);
  assert.equal(item.iconPath.color.id, 'charts.red');
  assert.match(p.summary(), /\+ 4 public · # 1 protected · ~ 3 package · − 2 private/);
  test.filter = 'api';
  const names = p.getChildren(p.roots[0]).map((n) => n.sym.name);
  test.filter = undefined;
  assert.deepEqual(names, ['OrderService', 'validate', 'Listener', 'State']);
});
