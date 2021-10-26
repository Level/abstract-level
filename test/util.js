'use strict'

const { fromCallback } = require('catering')
const { AbstractLevelDOWN, AbstractIterator, AbstractChainedBatch } = require('..')
const concat = require('level-concat-iterator')

const kPromise = Symbol('promise')
const nfre = /NotFound/i
const spies = []

exports.verifyNotFoundError = function verifyNotFoundError (err) {
  return nfre.test(err.message) || nfre.test(err.name)
}

exports.illegalKeys = [
  { name: 'null key', key: null, regex: /key cannot be `null` or `undefined`/ },
  { name: 'undefined key', key: undefined, regex: /key cannot be `null` or `undefined`/ }
]

exports.illegalValues = [
  { name: 'null key', value: null, regex: /value cannot be `null` or `undefined`/ },
  { name: 'undefined value', value: undefined, regex: /value cannot be `null` or `undefined`/ }
]

/**
 * Wrap a callback to check that it's called asynchronously. Must be
 * combined with a `ctx()`, `with()` or `end()` call.
 *
 * @param {function} cb Callback to check.
 * @param {string} name Optional callback name to use in assertion messages.
 * @returns {function} Wrapped callback.
 */
exports.assertAsync = function (cb, name) {
  const spy = {
    called: false,
    name: name || cb.name || 'anonymous'
  }

  spies.push(spy)

  return function (...args) {
    spy.called = true
    return cb.apply(this, args)
  }
}

/**
 * Verify that callbacks wrapped with `assertAsync()` were not yet called.
 * @param {import('tape').Test} t Tape test object.
 */
exports.assertAsync.end = function (t) {
  for (const { called, name } of spies.splice(0, spies.length)) {
    t.is(called, false, `callback (${name}) is asynchronous`)
  }
}

/**
 * Wrap a test function to verify `assertAsync()` spies at the end.
 * @param {import('tape').TestCase} test Test function to be passed to `tape()`.
 * @returns {import('tape').TestCase} Wrapped test function.
 */
exports.assertAsync.ctx = function (test) {
  return function (...args) {
    const ret = test.call(this, ...args)
    exports.assertAsync.end(args[0])
    return ret
  }
}

/**
 * Wrap an arbitrary callback to verify `assertAsync()` spies at the end.
 * @param {import('tape').Test} t Tape test object.
 * @param {function} cb Callback to wrap.
 * @returns {function} Wrapped callback.
 */
exports.assertAsync.with = function (t, cb) {
  return function (...args) {
    const ret = cb.call(this, ...args)
    exports.assertAsync.end(t)
    return ret
  }
}

exports.mockDown = function (methods, ...args) {
  class TestDown extends AbstractLevelDOWN {}
  for (const k in methods) TestDown.prototype[k] = methods[k]
  if (!args.length) args = [{ encodings: { utf8: true } }]
  return new TestDown(...args)
}

exports.mockIterator = function (db, options, methods, ...args) {
  class TestIterator extends AbstractIterator {}
  for (const k in methods) TestIterator.prototype[k] = methods[k]
  return new TestIterator(db, options, ...args)
}

exports.mockChainedBatch = function (db, methods, ...args) {
  class TestBatch extends AbstractChainedBatch {}
  for (const k in methods) TestBatch.prototype[k] = methods[k]
  return new TestBatch(db, ...args)
}

// TODO: move to level-concat-iterator
exports.concat = function (iterator, callback) {
  callback = fromCallback(callback, kPromise)
  concat(iterator, callback)
  return callback[kPromise]
}

// Mock encoding where null and undefined are significant types
exports.nullishEncoding = {
  name: 'nullish',
  format: 'utf8',
  encode (v) {
    return v === null ? '\x00' : v === undefined ? '\xff' : String(v)
  }
}
