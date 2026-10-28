'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { parse, typeKindOf } = require('../visibility');

const v = (h, c, k) => parse(h, c, k).visibility;

test('explicit modifiers', () => {
  assert.equal(v('public void ', 'class', 'method'), 'public');
  assert.equal(v('protected static int ', 'class', 'field'), 'protected');
  assert.equal(v('private final String ', 'class', 'field'), 'private');
});

test('no modifier in a class is package-private', () => {
  const r = parse('void ', 'class', 'method');
  assert.equal(r.visibility, 'package');
  assert.equal(r.implicit, true);
});

test('interface and annotation members are implicitly public', () => {
  assert.equal(v('void ', 'interface', 'method'), 'public');
  assert.equal(v('default void ', 'interface', 'method'), 'public');
  assert.equal(v('int MAX = ', 'interface', 'field'), 'public');
  assert.equal(v('String ', 'annotation', 'method'), 'public');
  assert.equal(v('private void ', 'interface', 'method'), 'private'); // Java 9+
});

test('enum: constants public, constructor implicitly private', () => {
  assert.equal(v('', 'enum', 'enumConstant'), 'public');
  assert.equal(v('', 'enum', 'constructor'), 'private');
  assert.equal(v('', 'enum', 'method'), 'package');
});

test('javadoc, comments and annotations do not produce false modifiers', () => {
  const h = `/** This is private API, do not use public methods here */
  @SuppressWarnings(value = "private")
  @Deprecated // public soon
  void `;
  assert.equal(v(h, 'class', 'method'), 'package');
  assert.equal(v('@Override\n  @Nullable(when = When.MAYBE) protected Object ', 'class', 'method'), 'protected');
  assert.equal(v('@a.b.C(x = f(1, (2)), y = "public") private int ', 'class', 'field'), 'private');
});

test('other modifiers are collected', () => {
  assert.deepEqual(parse('public static final int ', 'class', 'field').modifiers, ['static', 'final']);
  assert.deepEqual(parse('public abstract sealed class ', null, 'type').modifiers, ['abstract', 'sealed']);
  assert.deepEqual(parse('non-sealed class ', null, 'type').modifiers, ['non-sealed']);
});

test('type kind', () => {
  assert.equal(typeKindOf('public interface '), 'interface');
  assert.equal(typeKindOf('public @interface '), 'annotation');
  assert.equal(typeKindOf('@Retention(RUNTIME)\npublic @ interface '), 'annotation');
  assert.equal(typeKindOf('enum '), 'enum');
  assert.equal(typeKindOf('public record '), 'record');
  assert.equal(typeKindOf('/** an interface */ final class '), 'class');
  assert.equal(parse('class ', null, 'type').visibility, 'package');
});
