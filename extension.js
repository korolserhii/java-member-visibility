'use strict';
// Java Member Visibility — панель поруч з Outline, де кожен член Java-класу позначено видимістю:
// UML-знак (+ # − ~), слово (public / protected / private / package) і колір іконки.
//
// Чому окрема панель, а не Outline: API VS Code не дає змінювати іконки чи позначки в Outline для символів,
// які видає інше розширення (тип іконки — фіксований SymbolKind). Свою панель (TreeView) можна малювати як завгодно.
// Символи беремо в мовного сервера Java через стандартну команду vscode.executeDocumentSymbolProvider —
// тобто з Red Hat vscode-java (або будь-якого іншого Java-постачальника), без власного розбору всього файлу.

const vscode = require('vscode');
const { parse, typeKindOf, UML } = require('./visibility');

const SK = vscode.SymbolKind;
const TYPE_KINDS = new Set([SK.Class, SK.Interface, SK.Enum, SK.Struct]);
const MEMBER_KIND = new Map([
  [SK.Method, 'method'], [SK.Function, 'method'], [SK.Constructor, 'constructor'],
  [SK.Field, 'field'], [SK.Property, 'field'], [SK.Constant, 'field'], [SK.EnumMember, 'enumConstant'],
]);
const COLOR = { public: 'charts.green', protected: 'charts.yellow', private: 'charts.red', package: 'charts.blue' };
const ICON = {
  class: 'symbol-class', interface: 'symbol-interface', annotation: 'symbol-interface', enum: 'symbol-enum',
  record: 'symbol-structure', method: 'symbol-method', constructor: 'symbol-method', field: 'symbol-field',
  enumConstant: 'symbol-enum-member',
};
const ORDER = { public: 0, protected: 1, package: 2, private: 3 };

function headerText(doc, sym) {
  // Текст від початку оголошення (або початку рядка з назвою — для «private int a, b;») до самої назви.
  const nameStart = sym.selectionRange.start;
  const lineStart = new vscode.Position(nameStart.line, 0);
  const start = sym.range.start.isBefore(lineStart) ? sym.range.start : lineStart;
  return doc.getText(new vscode.Range(start, nameStart));
}

function build(doc, symbols, container) {
  const out = [];
  for (const sym of symbols || []) {
    const isType = TYPE_KINDS.has(sym.kind);
    const kind = isType ? 'type' : MEMBER_KIND.get(sym.kind);
    if (!kind) continue; // пакети, імпорти, локальні змінні — не члени
    const header = headerText(doc, sym);
    const info = parse(header, container, kind);
    const node = { sym, kind, info, header: header.trim(), children: [] };
    if (isType) {
      node.typeKind = info.typeKind || typeKindOf(header) || (sym.kind === SK.Interface ? 'interface' : sym.kind === SK.Enum ? 'enum' : 'class');
      node.children = build(doc, sym.children, node.typeKind);
    }
    out.push(node);
  }
  return out;
}

class Provider {
  constructor() {
    this._emitter = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._emitter.event;
    this.roots = [];
    this.uri = null;
    this.state = 'idle';
  }

  config() {
    const c = vscode.workspace.getConfiguration('javaVisibility');
    return { filter: c.get('filter', 'all'), sort: c.get('sort', 'source') };
  }

  visible(node, filter) {
    if (filter === 'all') return true;
    if (node.kind === 'type') return true;
    const v = node.info.visibility;
    if (filter === 'api') return v === 'public' || v === 'protected';
    if (filter === 'public') return v === 'public';
    return true;
  }

  getChildren(node) {
    const { filter, sort } = this.config();
    let list = (node ? node.children : this.roots).filter((n) => this.visible(n, filter));
    if (sort === 'visibility') {
      list = [...list].sort((a, b) => (a.kind === 'type') - (b.kind === 'type') || ORDER[a.info.visibility] - ORDER[b.info.visibility]);
    }
    return list;
  }

  getTreeItem(node) {
    const v = node.info.visibility;
    const label = node.sym.name;
    const item = new vscode.TreeItem(label,
      node.children.length ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None);
    const mods = node.info.modifiers.join(' ');
    const word = v === 'package' ? 'package-private' : v;
    item.description = `${UML[v]} ${word}${node.info.implicit ? ' (implicit)' : ''}${mods ? ' · ' + mods : ''}`;
    const iconKey = node.kind === 'type' ? node.typeKind : node.kind;
    item.iconPath = new vscode.ThemeIcon(ICON[iconKey] || 'symbol-misc', new vscode.ThemeColor(COLOR[v]));
    const md = new vscode.MarkdownString();
    md.appendMarkdown(`**${UML[v]} ${word}**${node.info.implicit ? ' — implicit (Java default for this place)' : ''}\n\n`);
    md.appendCodeblock((node.header + ' ' + node.sym.name).replace(/\s+/g, ' ').trim(), 'java');
    item.tooltip = md;
    item.contextValue = `jv.${v}`;
    item.command = { command: 'javaVisibility.reveal', title: 'Go to declaration', arguments: [this.uri, node.sym.selectionRange] };
    return item;
  }

  summary() {
    const n = { public: 0, protected: 0, package: 0, private: 0 };
    const walk = (list) => list.forEach((x) => { if (x.kind !== 'type') n[x.info.visibility]++; walk(x.children); });
    walk(this.roots);
    return `+ ${n.public} public · # ${n.protected} protected · ~ ${n.package} package · − ${n.private} private`;
  }

  async refresh(editor) {
    if (!editor || editor.document.languageId !== 'java') {
      this.roots = [];
      this.uri = null;
      this.state = 'idle';
      this._emitter.fire();
      return;
    }
    const doc = editor.document;
    let symbols;
    try {
      symbols = await vscode.commands.executeCommand('vscode.executeDocumentSymbolProvider', doc.uri);
    } catch (e) {
      symbols = undefined;
    }
    if (!symbols || !symbols.length) {
      this.state = 'waiting';
      this.roots = [];
    } else if (!('selectionRange' in symbols[0])) {
      this.state = 'flat'; // постачальник дав плоский список без вкладеності — працювати не можемо
      this.roots = [];
    } else {
      this.state = 'ok';
      this.roots = build(doc, symbols, null);
    }
    this.uri = doc.uri;
    this._emitter.fire();
  }
}

function activate(context) {
  const provider = new Provider();
  const view = vscode.window.createTreeView('javaVisibility.members', { treeDataProvider: provider, showCollapseAll: true });
  context.subscriptions.push(view);

  const updateMessage = () => {
    if (provider.state === 'waiting') view.message = 'Waiting for Java symbols… Make sure “Language Support for Java by Red Hat” is installed and the project has finished loading.';
    else if (provider.state === 'flat') view.message = 'The Java symbol provider returned a flat list; hierarchical symbols are required.';
    else if (provider.state === 'ok') {
      const f = provider.config().filter;
      view.message = provider.summary() + (f !== 'all' ? `  —  filter: ${f === 'api' ? 'public + protected' : 'public only'}` : '');
    } else view.message = undefined;
  };

  let timer;
  let retries = 0;
  const schedule = (delay) => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      await provider.refresh(vscode.window.activeTextEditor);
      updateMessage();
      // Мовний сервер Java після відкриття проєкту може «прогріватися» хвилину — пробуємо ще, але не вічно.
      if (provider.state === 'waiting' && retries < 30) { retries++; schedule(2000); } else if (provider.state !== 'waiting') retries = 0;
    }, delay);
  };

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(() => { retries = 0; schedule(50); }),
    vscode.workspace.onDidChangeTextDocument((e) => {
      const ed = vscode.window.activeTextEditor;
      if (ed && e.document === ed.document && e.document.languageId === 'java') schedule(700);
    }),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('javaVisibility')) { provider._emitter.fire(); updateMessage(); }
    }),
    vscode.commands.registerCommand('javaVisibility.reveal', async (uri, range) => {
      if (!uri) return;
      const ed = await vscode.window.showTextDocument(uri, { preserveFocus: false });
      ed.selection = new vscode.Selection(range.start, range.start);
      ed.revealRange(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
    }),
    vscode.commands.registerCommand('javaVisibility.filter', async () => {
      const pick = await vscode.window.showQuickPick([
        { label: 'All members', value: 'all' },
        { label: 'Public API (public + protected)', value: 'api' },
        { label: 'Public only', value: 'public' },
      ], { placeHolder: 'Which members to show' });
      if (pick) await vscode.workspace.getConfiguration('javaVisibility').update('filter', pick.value, vscode.ConfigurationTarget.Global);
    }),
    vscode.commands.registerCommand('javaVisibility.sort', async () => {
      const c = vscode.workspace.getConfiguration('javaVisibility');
      await c.update('sort', c.get('sort', 'source') === 'source' ? 'visibility' : 'source', vscode.ConfigurationTarget.Global);
    }),
    vscode.commands.registerCommand('javaVisibility.refresh', () => { retries = 0; schedule(0); }),
  );

  schedule(0);
}

function deactivate() {}

module.exports = { activate, deactivate, _build: build, _Provider: Provider };
