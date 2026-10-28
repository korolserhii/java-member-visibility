'use strict';
// Розбір видимості Java-члена з тексту його оголошення. Чиста функція — без vscode, щоб її можна було перевіряти тестами.
//
// Вхід: header — текст від початку оголошення до назви (анотації, коментарі, модифікатори, тип);
//       container — у якому типі лежить член: 'class' | 'interface' | 'annotation' | 'enum' | 'record' | null (верхній рівень);
//       kind — 'type' | 'method' | 'constructor' | 'field' | 'enumConstant'.
// Вихід: { visibility: 'public'|'protected'|'private'|'package', implicit: bool, modifiers: [..], typeKind? }.
// Правила за Java Language Specification: члени інтерфейсу й анотації — неявно public; константи enum — public;
// конструктор enum — неявно private; без модифікатора в класі — package-private.

const VIS = ['public', 'protected', 'private'];
const OTHER = ['static', 'final', 'abstract', 'default', 'sealed', 'non-sealed', 'synchronized', 'native',
  'transient', 'volatile', 'strictfp'];

function stripNoise(text) {
  let s = String(text || '');
  s = s.replace(/\/\*[\s\S]*?\*\//g, ' ');          // блокові коментарі й javadoc
  s = s.replace(/\/\/[^\n]*/g, ' ');                 // рядкові коментарі
  s = s.replace(/"(?:\\.|[^"\\])*"/g, '""');          // рядки (в анотаціях можуть бути слова public тощо)
  // анотації з дужками: прибираємо збалансовано, щоб @Foo(value = "private") не дав хибного модифікатора
  let out = '';
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '@' && !/^@\s*interface\b/.test(s.slice(i))) {
      const m = /^@\s*[\w.]+/.exec(s.slice(i));
      if (m) {
        i += m[0].length;
        let j = i;
        while (j < s.length && /\s/.test(s[j])) j++;
        if (s[j] === '(') {
          let depth = 0;
          for (; j < s.length; j++) {
            if (s[j] === '(') depth++;
            else if (s[j] === ')' && --depth === 0) break;
          }
          i = j + 1;
        }
        i--;
        out += ' ';
        continue;
      }
    }
    out += s[i];
  }
  return out;
}

function words(text) {
  return stripNoise(text).match(/@\s*interface|non-sealed|[A-Za-z_$][\w$]*/g) || [];
}

function typeKindOf(header) {
  const w = words(header);
  if (w.some((x) => /^@\s*interface$/.test(x))) return 'annotation';
  for (const k of ['interface', 'enum', 'record', 'class']) if (w.includes(k)) return k;
  return null;
}

function parse(header, container, kind) {
  const w = words(header);
  const modifiers = w.filter((x) => OTHER.includes(x));
  const explicit = w.find((x) => VIS.includes(x));
  const res = { modifiers };
  if (kind === 'type') res.typeKind = typeKindOf(header) || 'class';
  if (explicit) return { ...res, visibility: explicit, implicit: false };

  let vis = 'package';
  if (kind === 'enumConstant') vis = 'public';
  else if (container === 'interface' || container === 'annotation') vis = 'public';
  else if (container === 'enum' && kind === 'constructor') vis = 'private';
  return { ...res, visibility: vis, implicit: true };
}

// UML-позначки видимості — загальноприйнятий стандарт (UML 2): + public, # protected, − private, ~ package
const UML = { public: '+', protected: '#', private: '−', package: '~' };

module.exports = { parse, typeKindOf, stripNoise, UML };
