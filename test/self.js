'use strict'

const test = require('tape')
const sinon = require('sinon')
const inherits = require('util').inherits
const isBuffer = require('is-buffer')
const { Buffer } = require('buffer')
const AbstractLevelDOWN = require('../').AbstractLevelDOWN
const AbstractIterator = require('../').AbstractIterator
const AbstractChainedBatch = require('../').AbstractChainedBatch
const getRangeOptions = require('../lib/range-options')

const testCommon = require('./common')({
  test,
  factory: function () {
    return new AbstractLevelDOWN({ encodings: { utf8: true } })
  }
})

const rangeOptions = ['gt', 'gte', 'lt', 'lte']

// Test the suite itself as well as the default implementation,
// excluding noop operations that can't pass the test suite.

require('./factory-test')(test, testCommon)
require('./manifest-test')(test, testCommon)
require('./open-test').all(test, testCommon)

require('./del-test').setUp(test, testCommon)
require('./del-test').args(test, testCommon)
require('./del-test').events(test, testCommon)
require('./del-test').tearDown(test, testCommon)

require('./get-test').setUp(test, testCommon)
require('./get-test').args(test, testCommon)
require('./get-test').tearDown(test, testCommon)

require('./get-many-test').setUp(test, testCommon)
require('./get-many-test').args(test, testCommon)
require('./get-many-test').tearDown(test, testCommon)

require('./put-test').setUp(test, testCommon)
require('./put-test').args(test, testCommon)
require('./put-test').events(test, testCommon)
require('./put-test').tearDown(test, testCommon)

require('./put-get-del-test').setUp(test, testCommon)
require('./put-get-del-test').tearDown(test, testCommon)

require('./batch-test').setUp(test, testCommon)
require('./batch-test').args(test, testCommon)
require('./batch-test').events(test, testCommon)
require('./batch-test').tearDown(test, testCommon)

require('./chained-batch-test').setUp(test, testCommon)
require('./chained-batch-test').args(test, testCommon)
require('./chained-batch-test').events(test, testCommon)
require('./chained-batch-test').tearDown(test, testCommon)

require('./close-test').all(test, testCommon)

require('./iterator-test').setUp(test, testCommon)
require('./iterator-test').args(test, testCommon)
require('./iterator-test').sequence(test, testCommon)
require('./iterator-test').tearDown(test, testCommon)

require('./iterator-range-test').setUp(test, testCommon)
require('./iterator-range-test').tearDown(test, testCommon)

require('./async-iterator-test').setup(test, testCommon)
require('./async-iterator-test').teardown(test, testCommon)

require('./iterator-seek-test').sequence(test, testCommon)

require('./clear-test').args(test, testCommon)
require('./clear-test').events(test, testCommon)

function implement (ctor, methods) {
  function Test () {
    ctor.apply(this, arguments)
  }

  inherits(Test, ctor)

  for (const k in methods) {
    Test.prototype[k] = methods[k]
  }

  return Test
}

// Temporary test for browsers
// Not supported on Safari < 12 and Safari iOS < 12
test('async generator', async function (t) {
  let ended = false

  const end = async () => {
    await new Promise((resolve) => setTimeout(resolve, 100))
    ended = true
  }

  async function * generator () {
    try {
      yield 1
      yield 2
      yield 3
      yield 4
    } finally {
      // Test that we're always able to cleanup resources
      await end()
    }
  }

  const res = []

  for await (const x of generator()) {
    res.push(x)
    if (x === 2) break
  }

  t.same(res, [1, 2])
  t.is(ended, true)

  ended = false

  try {
    for await (const x of generator()) {
      res.push(x)
      if (x === 2) throw new Error('userland error')
    }
  } catch (err) {
    t.is(err.message, 'userland error')
  }

  t.same(res, [1, 2, 1, 2])
  t.is(ended, true)
})

/**
 * Extensibility
 */

test('test core extensibility', function (t) {
  const Test = implement(AbstractLevelDOWN)
  const test = new Test({ encodings: { utf8: true } })
  t.equal(test.status, 'opening', 'status is opening')
  t.end()
})

test('test open() extensibility when new', function (t) {
  const spy = sinon.spy()
  const expectedCb = function () {}
  const expectedOptions = { createIfMissing: true, errorIfExists: false }
  const Test = implement(AbstractLevelDOWN, { _open: spy })
  const test = new Test({ encodings: { utf8: true } })
  const test2 = new Test({ encodings: { utf8: true } })

  test.open(expectedCb)

  t.equal(spy.callCount, 1, 'got _open() call')
  t.equal(spy.getCall(0).thisValue, test, '`this` on _open() was correct')
  t.equal(spy.getCall(0).args.length, 2, 'got two arguments')
  t.deepEqual(spy.getCall(0).args[0], expectedOptions, 'got default options argument')

  test2.open({ options: 1 }, expectedCb)

  expectedOptions.options = 1

  t.equal(spy.callCount, 2, 'got _open() call')
  t.equal(spy.getCall(1).thisValue, test2, '`this` on _open() was correct')
  t.equal(spy.getCall(1).args.length, 2, 'got two arguments')
  t.deepEqual(spy.getCall(1).args[0], expectedOptions, 'got expected options argument')
  t.end()
})

test('test open() extensibility when open', function (t) {
  t.plan(3)

  const spy = sinon.spy(function (options, cb) { this.nextTick(cb) })
  const Test = implement(AbstractLevelDOWN, { _open: spy })
  const test = new Test({ encodings: { utf8: true } })

  test.once('open', function () {
    t.is(spy.callCount, 1, 'got _open() call')

    test.open(t.ifError.bind(t))

    t.is(spy.callCount, 1, 'did not get second _open() call')
  })
})

test('test opening explicitly gives a chance to capture an error', function (t) {
  t.plan(2)

  const spy = sinon.spy(function (options, cb) { this.nextTick(cb, new Error('_open error')) })
  const Test = implement(AbstractLevelDOWN, { _open: spy })
  const test = new Test({ encodings: { utf8: true } })

  test.open(function (err) {
    t.is(spy.callCount, 1, 'got _open() call')
    t.is(err && err.message, '_open error')
  })
})

test('test opening explicitly gives a chance to capture an error with promise', async function (t) {
  t.plan(2)

  const spy = sinon.spy(function (options, cb) { this.nextTick(cb, new Error('_open error')) })
  const Test = implement(AbstractLevelDOWN, { _open: spy })
  const test = new Test({ encodings: { utf8: true } })

  try {
    await test.open()
  } catch (err) {
    t.is(spy.callCount, 1, 'got _open() call')
    t.is(err && err.message, '_open error')
  }
})

test('test close() extensibility when open', function (t) {
  t.plan(4)

  const spy = sinon.spy(function (cb) { this.nextTick(cb) })
  const Test = implement(AbstractLevelDOWN, { _close: spy })
  const test = new Test({ encodings: { utf8: true } })

  test.once('open', function () {
    test.close(function (err) {
      t.ifError(err, 'no close() error')
      t.is(spy.callCount, 1, 'got _close() call')
      t.is(spy.getCall(0).thisValue, test, '`this` on _close() was correct')
      t.is(spy.getCall(0).args.length, 1, 'got one arguments')
    })
  })
})

test('test close() extensibility when new', function (t) {
  t.plan(3)

  const spy = sinon.spy(function (cb) { this.nextTick(cb) })
  const Test = implement(AbstractLevelDOWN, { _close: spy })
  const test = new Test({ encodings: { utf8: true } })

  test.close(function (err) {
    t.ifError(err, 'no close() error')
    t.is(spy.callCount, 1, 'did get _close() call')
  })

  t.is(spy.callCount, 0, 'did not get _close() call')
})

test('test open(), close(), open() with twice failed open', function (t) {
  t.plan(6)

  const db = testCommon.factory()
  const order = []

  let opens = 0

  db.on('open', t.fail.bind(t))
  db.on('closed', t.fail.bind(t))

  db._open = function (options, callback) {
    t.pass('called')
    this.nextTick(callback, new Error('test' + (++opens)))
  }

  db.open(function (err) {
    t.is(err && err.message, 'test1')
    order.push('A')
  })

  db.close(function (err) {
    t.ifError(err)
    order.push('B')
  })

  db.open(function (err) {
    t.is(err && err.message, 'test2')
    order.push('C')
    t.same(order, ['A', 'B', 'C'], 'order is ok')
  })
})

test('test open(), close(), open() with first failed open', function (t) {
  t.plan(9)

  const db = testCommon.factory()
  const order = []

  let opens = 0

  db.on('open', () => { order.push('open event') })
  db.on('closed', t.fail.bind(t))

  db._open = function (options, callback) {
    t.pass('called')
    this.nextTick(callback, opens++ ? null : new Error('test'))
  }

  db.open(function (err) {
    t.ifError(err)
    t.is(db.status, 'open')
    order.push('A')
  })

  db.close(function (err) {
    t.is(err && err.message, 'Database is not closed')
    t.is(db.status, 'open')
    order.push('B')
  })

  db.open(function (err) {
    t.ifError(err)
    t.is(db.status, 'open')
    order.push('C')
    t.same(order, ['A', 'B', 'open event', 'C'], 'order is ok')
  })
})

test('test open(), close(), open() with second failed open', function (t) {
  t.plan(9)

  const db = testCommon.factory()
  const order = []

  let opens = 0

  db.on('open', t.fail.bind(t))
  db.on('closed', t.fail.bind(t))

  db._open = function (options, callback) {
    t.pass('called')
    this.nextTick(callback, opens++ ? new Error('test') : null)
  }

  db.open(function (err) {
    t.is(err && err.message, 'Database is not open')
    t.is(db.status, 'closed')
    order.push('A')
  })

  db.close(function (err) {
    t.ifError(err)
    t.is(db.status, 'closed')
    order.push('B')
  })

  db.open(function (err) {
    t.is(err && err.message, 'test')
    t.is(db.status, 'closed')
    order.push('C')
    t.same(order, ['A', 'B', 'C'], 'order is ok')
  })
})

test('test get() extensibility', function (t) {
  t.plan(12)

  const spy = sinon.spy()
  const expectedCb = function () {}
  const expectedOptions = { keyEncoding: 'utf8', valueEncoding: 'utf8' }
  const expectedKey = 'a key'
  const Test = implement(AbstractLevelDOWN, { _get: spy })
  const test = new Test({ encodings: { utf8: true } }, { keyEncoding: 'utf8' })

  test.once('open', function () {
    test.get(expectedKey, expectedCb)

    t.equal(spy.callCount, 1, 'got _get() call')
    t.equal(spy.getCall(0).thisValue, test, '`this` on _get() was correct')
    t.equal(spy.getCall(0).args.length, 3, 'got three arguments')
    t.equal(spy.getCall(0).args[0], expectedKey, 'got expected key argument')
    t.deepEqual(spy.getCall(0).args[1], expectedOptions, 'got default options argument')
    t.is(typeof spy.getCall(0).args[2], 'function', 'got cb argument')

    test.get(expectedKey, { options: 1 }, expectedCb)

    expectedOptions.options = 1

    t.equal(spy.callCount, 2, 'got _get() call')
    t.equal(spy.getCall(1).thisValue, test, '`this` on _get() was correct')
    t.equal(spy.getCall(1).args.length, 3, 'got three arguments')
    t.equal(spy.getCall(1).args[0], expectedKey, 'got expected key argument')
    t.deepEqual(spy.getCall(1).args[1], expectedOptions, 'got expected options argument')
    t.is(typeof spy.getCall(1).args[2], 'function', 'got cb argument')
  })
})

test('test getMany() extensibility', function (t) {
  t.plan(12)

  const spy = sinon.spy()
  const expectedCb = function () {}
  const expectedOptions = { keyEncoding: 'utf8', valueEncoding: 'utf8' }
  const expectedKey = 'a key'
  const Test = implement(AbstractLevelDOWN, { _getMany: spy })
  const test = new Test({ encodings: { utf8: true } })

  test.once('open', function () {
    test.getMany([expectedKey], expectedCb)

    t.equal(spy.callCount, 1, 'got _getMany() call')
    t.equal(spy.getCall(0).thisValue, test, '`this` on _getMany() was correct')
    t.equal(spy.getCall(0).args.length, 3, 'got three arguments')
    t.deepEqual(spy.getCall(0).args[0], [expectedKey], 'got expected keys argument')
    t.deepEqual(spy.getCall(0).args[1], expectedOptions, 'got default options argument')
    t.is(typeof spy.getCall(0).args[2], 'function', 'got cb argument')

    test.getMany([expectedKey], { options: 1 }, expectedCb)

    expectedOptions.options = 1

    t.equal(spy.callCount, 2, 'got _getMany() call')
    t.equal(spy.getCall(1).thisValue, test, '`this` on _getMany() was correct')
    t.equal(spy.getCall(1).args.length, 3, 'got three arguments')
    t.deepEqual(spy.getCall(1).args[0], [expectedKey], 'got expected key argument')
    t.deepEqual(spy.getCall(1).args[1], expectedOptions, 'got expected options argument')
    t.is(typeof spy.getCall(1).args[2], 'function', 'got cb argument')
  })
})

test('test del() extensibility', function (t) {
  t.plan(12)

  const spy = sinon.spy()
  const expectedCb = function () {}
  const expectedOptions = { options: 1, keyEncoding: 'utf8' }
  const expectedKey = 'a key'
  const Test = implement(AbstractLevelDOWN, { _del: spy })
  const test = new Test({ encodings: { utf8: true } })

  test.once('open', function () {
    test.del(expectedKey, expectedCb)

    t.equal(spy.callCount, 1, 'got _del() call')
    t.equal(spy.getCall(0).thisValue, test, '`this` on _del() was correct')
    t.equal(spy.getCall(0).args.length, 3, 'got three arguments')
    t.equal(spy.getCall(0).args[0], expectedKey, 'got expected key argument')
    t.deepEqual(spy.getCall(0).args[1], { keyEncoding: 'utf8' }, 'got blank options argument')
    t.equal(typeof spy.getCall(0).args[2], 'function', 'got cb argument')

    test.del(expectedKey, expectedOptions, expectedCb)

    t.equal(spy.callCount, 2, 'got _del() call')
    t.equal(spy.getCall(1).thisValue, test, '`this` on _del() was correct')
    t.equal(spy.getCall(1).args.length, 3, 'got three arguments')
    t.equal(spy.getCall(1).args[0], expectedKey, 'got expected key argument')
    t.deepEqual(spy.getCall(1).args[1], expectedOptions, 'got expected options argument')
    t.equal(typeof spy.getCall(1).args[2], 'function', 'got cb argument')
  })
})

test('test put() extensibility', function (t) {
  t.plan(14)

  const spy = sinon.spy()
  const expectedCb = function () {}
  const expectedOptions = { options: 1, keyEncoding: 'utf8', valueEncoding: 'utf8' }
  const expectedKey = 'a key'
  const expectedValue = 'a value'
  const Test = implement(AbstractLevelDOWN, { _put: spy })
  const test = new Test({ encodings: { utf8: true } })

  test.once('open', function () {
    test.put(expectedKey, expectedValue, expectedCb)

    t.equal(spy.callCount, 1, 'got _put() call')
    t.equal(spy.getCall(0).thisValue, test, '`this` on _put() was correct')
    t.equal(spy.getCall(0).args.length, 4, 'got four arguments')
    t.equal(spy.getCall(0).args[0], expectedKey, 'got expected key argument')
    t.equal(spy.getCall(0).args[1], expectedValue, 'got expected value argument')
    t.deepEqual(spy.getCall(0).args[2], { keyEncoding: 'utf8', valueEncoding: 'utf8' }, 'got default options argument')
    t.equal(typeof spy.getCall(0).args[3], 'function', 'got cb argument')

    test.put(expectedKey, expectedValue, expectedOptions, expectedCb)

    t.equal(spy.callCount, 2, 'got _put() call')
    t.equal(spy.getCall(1).thisValue, test, '`this` on _put() was correct')
    t.equal(spy.getCall(1).args.length, 4, 'got four arguments')
    t.equal(spy.getCall(1).args[0], expectedKey, 'got expected key argument')
    t.equal(spy.getCall(1).args[1], expectedValue, 'got expected value argument')
    t.deepEqual(spy.getCall(1).args[2], expectedOptions, 'got expected options argument')
    t.equal(typeof spy.getCall(1).args[3], 'function', 'got cb argument')
  })
})

test('test batch([]) (array-form) extensibility', function (t) {
  t.plan(18)

  const spy = sinon.spy()
  const expectedCb = function () {}
  const expectedOptions = { options: 1 }
  const expectedArray = [
    { type: 'put', key: '1', value: '1', keyEncoding: 'utf8', valueEncoding: 'utf8' },
    { type: 'del', key: '2', keyEncoding: 'utf8' }
  ]
  const Test = implement(AbstractLevelDOWN, { _batch: spy })
  const test = new Test({ encodings: { utf8: true } })

  test.once('open', function () {
    test.batch(expectedArray, expectedCb)

    t.equal(spy.callCount, 1, 'got _batch() call')
    t.equal(spy.getCall(0).thisValue, test, '`this` on _batch() was correct')
    t.equal(spy.getCall(0).args.length, 3, 'got three arguments')
    t.deepEqual(spy.getCall(0).args[0], expectedArray, 'got expected array argument')
    t.deepEqual(spy.getCall(0).args[1], {}, 'got expected options argument')
    t.equal(typeof spy.getCall(0).args[2], 'function', 'got callback argument')

    test.batch(expectedArray, expectedOptions, expectedCb)

    t.equal(spy.callCount, 2, 'got _batch() call')
    t.equal(spy.getCall(1).thisValue, test, '`this` on _batch() was correct')
    t.equal(spy.getCall(1).args.length, 3, 'got three arguments')
    t.deepEqual(spy.getCall(1).args[0], expectedArray, 'got expected array argument')
    t.deepEqual(spy.getCall(1).args[1], expectedOptions, 'got expected options argument')
    t.equal(typeof spy.getCall(1).args[2], 'function', 'got callback argument')

    test.batch(expectedArray, null, expectedCb)

    t.equal(spy.callCount, 3, 'got _batch() call')
    t.equal(spy.getCall(2).thisValue, test, '`this` on _batch() was correct')
    t.equal(spy.getCall(2).args.length, 3, 'got three arguments')
    t.deepEqual(spy.getCall(2).args[0], expectedArray, 'got expected array argument')
    t.ok(spy.getCall(2).args[1], 'options should not be null')
    t.equal(typeof spy.getCall(2).args[2], 'function', 'got callback argument')
  })
})

test('test batch([]) (array-form) with empty array is asynchronous', function (t) {
  t.plan(3)

  const spy = sinon.spy()
  const Test = implement(AbstractLevelDOWN, { _batch: spy })
  const test = new Test({ encodings: { utf8: true } })

  test.once('open', function () {
    let async = false

    test.batch([], function (err) {
      t.ifError(err, 'no error')
      t.ok(async, 'callback is asynchronous')

      // Assert that asynchronicity is provided by batch() rather than _batch()
      t.is(spy.callCount, 0, '_batch() call was bypassed')
    })

    async = true
  })
})

test('test chained batch() extensibility', function (t) {
  t.plan(16)

  const spy = sinon.spy()
  const expectedCb = function () {}
  const expectedOptions = { options: 1 }
  const Test = implement(AbstractLevelDOWN, { _batch: spy })
  const test = new Test({ encodings: { utf8: true } })

  test.once('open', function () {
    test.batch().put('foo', 'bar').del('bang').write(expectedCb)

    t.equal(spy.callCount, 1, 'got _batch() call')
    t.equal(spy.getCall(0).thisValue, test, '`this` on _batch() was correct')
    t.equal(spy.getCall(0).args.length, 3, 'got three arguments')
    t.equal(spy.getCall(0).args[0].length, 2, 'got expected array argument')
    t.deepEqual(spy.getCall(0).args[0][0], { keyEncoding: 'utf8', valueEncoding: 'utf8', type: 'put', key: 'foo', value: 'bar' }, 'got expected array argument[0]')
    t.deepEqual(spy.getCall(0).args[0][1], { keyEncoding: 'utf8', type: 'del', key: 'bang' }, 'got expected array argument[1]')
    t.deepEqual(spy.getCall(0).args[1], {}, 'got expected options argument')
    t.is(typeof spy.getCall(0).args[2], 'function', 'got callback argument')

    test.batch().put('foo', 'bar', expectedOptions).del('bang', expectedOptions).write(expectedOptions, expectedCb)

    t.equal(spy.callCount, 2, 'got _batch() call')
    t.equal(spy.getCall(1).thisValue, test, '`this` on _batch() was correct')
    t.equal(spy.getCall(1).args.length, 3, 'got three arguments')
    t.equal(spy.getCall(1).args[0].length, 2, 'got expected array argument')
    t.deepEqual(spy.getCall(1).args[0][0], { keyEncoding: 'utf8', valueEncoding: 'utf8', type: 'put', key: 'foo', value: 'bar', options: 1 }, 'got expected array argument[0]')
    t.deepEqual(spy.getCall(1).args[0][1], { keyEncoding: 'utf8', type: 'del', key: 'bang', options: 1 }, 'got expected array argument[1]')
    t.deepEqual(spy.getCall(1).args[1], { options: 1 }, 'got expected options argument')
    t.is(typeof spy.getCall(1).args[2], 'function', 'got callback argument')
  })
})

test('test chained batch() with no operations is asynchronous', function (t) {
  t.plan(2)

  const Test = implement(AbstractLevelDOWN, {})
  const test = new Test({ encodings: { utf8: true } })

  test.once('open', function () {
    let async = false

    test.batch().write(function (err) {
      t.ifError(err, 'no error')
      t.ok(async, 'callback is asynchronous')
    })

    async = true
  })
})

test('test chained batch() (custom _chainedBatch) extensibility', function (t) {
  t.plan(4)

  const spy = sinon.spy()
  const Test = implement(AbstractLevelDOWN, { _chainedBatch: spy })
  const test = new Test({ encodings: { utf8: true } })

  test.once('open', function () {
    test.batch()

    t.equal(spy.callCount, 1, 'got _chainedBatch() call')
    t.equal(spy.getCall(0).thisValue, test, '`this` on _chainedBatch() was correct')

    test.batch()

    t.equal(spy.callCount, 2, 'got _chainedBatch() call')
    t.equal(spy.getCall(1).thisValue, test, '`this` on _chainedBatch() was correct')
  })
})

test('test AbstractChainedBatch extensibility', function (t) {
  const Batch = implement(AbstractChainedBatch)
  const db = testCommon.factory()
  const test = new Batch(db)
  t.ok(test.db === db, 'instance has db reference')
  t.end()
})

test('test AbstractChainedBatch expects a db', function (t) {
  t.plan(1)

  const Test = implement(AbstractChainedBatch)

  try {
    Test()
  } catch (err) {
    t.is(err.message, 'First argument must be an abstract-leveldown compliant store')
  }
})

test('test AbstractChainedBatch#write() extensibility', function (t) {
  t.plan(3)

  let batch

  const Test = implement(AbstractChainedBatch, {
    _write: function (options, callback) {
      t.same(options, {})
      t.is(this, batch, 'thisArg on _write() is correct')
      this.nextTick(callback)
    }
  })

  const db = testCommon.factory()

  db.once('open', function () {
    batch = new Test(db)

    // Without any operations, _write isn't called
    batch.put('foo', 'bar')
    batch.write(function (err) {
      t.ifError(err)
    })
  })
})

test('test AbstractChainedBatch#write() extensibility with null options', function (t) {
  t.plan(3)

  let batch

  const Test = implement(AbstractChainedBatch, {
    _write: function (options, callback) {
      t.same(options, {})
      t.is(this, batch, 'thisArg on _write() is correct')
      this.nextTick(callback)
    }
  })

  const db = testCommon.factory()

  db.once('open', function () {
    batch = new Test(db)

    // Without any operations, _write isn't called
    batch.put('foo', 'bar')
    batch.write(null, function (err) {
      t.ifError(err)
    })
  })
})

test('test AbstractChainedBatch#write() extensibility with options', function (t) {
  t.plan(3)

  let batch

  const Test = implement(AbstractChainedBatch, {
    _write: function (options, callback) {
      t.same(options, { test: true })
      t.is(this, batch, 'thisArg on _write() is correct')
      this.nextTick(callback)
    }
  })

  const db = testCommon.factory()

  db.once('open', function () {
    batch = new Test(db)
    // Without any operations, _write isn't called
    batch.put('foo', 'bar')
    batch.write({ test: true }, function (err) {
      t.ifError(err)
    })
  })
})

test('test AbstractChainedBatch#put() extensibility', function (t) {
  t.plan(7)

  const spy = sinon.spy()
  const expectedKey = 'key'
  const expectedValue = 'value'
  const Test = implement(AbstractChainedBatch, { _put: spy })
  const db = testCommon.factory()

  db.once('open', function () {
    const test = new Test(db)
    const returnValue = test.put(expectedKey, expectedValue)

    t.equal(spy.callCount, 1, 'got _put call')
    t.equal(spy.getCall(0).thisValue, test, '`this` on _put() was correct')
    t.equal(spy.getCall(0).args.length, 3, 'got 3 arguments')
    t.equal(spy.getCall(0).args[0], expectedKey, 'got expected key argument')
    t.equal(spy.getCall(0).args[1], expectedValue, 'got expected value argument')
    t.same(spy.getCall(0).args[2], { keyEncoding: 'utf8', valueEncoding: 'utf8' }, 'got expected options argument')
    t.equal(returnValue, test, 'get expected return value')
  })
})

test('test AbstractChainedBatch#del() extensibility', function (t) {
  t.plan(6)

  const spy = sinon.spy()
  const expectedKey = 'key'
  const Test = implement(AbstractChainedBatch, { _del: spy })
  const db = testCommon.factory()

  db.once('open', function () {
    const test = new Test(db)
    const returnValue = test.del(expectedKey)

    t.equal(spy.callCount, 1, 'got _del call')
    t.equal(spy.getCall(0).thisValue, test, '`this` on _del() was correct')
    t.equal(spy.getCall(0).args.length, 2, 'got 2 arguments')
    t.equal(spy.getCall(0).args[0], expectedKey, 'got expected key argument')
    t.same(spy.getCall(0).args[1], { keyEncoding: 'utf8' }, 'got expected options argument')
    t.equal(returnValue, test, 'get expected return value')
  })
})

test('test AbstractChainedBatch#clear() extensibility', function (t) {
  t.plan(4)

  const spy = sinon.spy()
  const Test = implement(AbstractChainedBatch, { _clear: spy })
  const db = testCommon.factory()

  db.once('open', function () {
    const test = new Test(db)
    const returnValue = test.clear()

    t.equal(spy.callCount, 1, 'got _clear call')
    t.equal(spy.getCall(0).thisValue, test, '`this` on _clear() was correct')
    t.equal(spy.getCall(0).args.length, 0, 'got zero arguments')
    t.equal(returnValue, test, 'get expected return value')
  })
})

test('test iterator() extensibility', function (t) {
  t.plan(4)

  const TestIterator = implement(AbstractIterator)
  const spy = sinon.spy(function (options) { return new TestIterator(this, options) })
  const expectedOptions = {
    options: 1,
    reverse: false,
    keys: true,
    values: true,
    limit: -1,
    keyEncoding: 'utf8',
    valueEncoding: 'utf8'
  }
  const Test = implement(AbstractLevelDOWN, { _iterator: spy })
  const test = new Test({ encodings: { utf8: true } })

  test.once('open', function () {
    test.iterator({ options: 1 })

    t.equal(spy.callCount, 1, 'got _iterator() call')
    t.equal(spy.getCall(0).thisValue, test, '`this` on _iterator() was correct')
    t.equal(spy.getCall(0).args.length, 1, 'got one arguments')
    t.deepEqual(spy.getCall(0).args[0], expectedOptions, 'got expected options argument')
  })
})

test('test AbstractIterator extensibility', function (t) {
  const Test = implement(AbstractIterator)
  const db = testCommon.factory()
  const test = new Test(db, {})
  t.ok(test.db === db, 'instance has db reference')
  t.end()
})

test('test AbstractIterator throws on invalid db argument', function (t) {
  t.plan(4 * 2)

  for (const args of [[], [null], [undefined], 'foo']) {
    try {
      // eslint-disable-next-line no-new
      new AbstractIterator(...args)
    } catch (err) {
      t.is(err.name, 'TypeError')
      t.is(err.message, 'First argument must be an abstract-leveldown compliant store')
    }
  }
})

test('test AbstractIterator throws on invalid options argument', function (t) {
  t.plan(4 * 2)

  for (const args of [[], [null], [undefined], 'foo']) {
    try {
      // eslint-disable-next-line no-new
      new AbstractIterator({}, ...args)
    } catch (err) {
      t.is(err.name, 'TypeError')
      t.is(err.message, 'The second argument must be an options object')
    }
  }
})

test('test AbstractIterator#next() extensibility', function (t) {
  t.plan(6)

  const spy = sinon.spy()
  const spycb = sinon.spy()
  const Test = implement(AbstractIterator, { _next: spy })
  const db = testCommon.factory()

  db.once('open', function () {
    const test = new Test(db, {})

    test.next(spycb)

    t.equal(spy.callCount, 1, 'got _next() call')
    t.equal(spy.getCall(0).thisValue, test, '`this` on _next() was correct')
    t.equal(spy.getCall(0).args.length, 1, 'got one arguments')
    t.equal(typeof spy.getCall(0).args[0], 'function', 'got a callback function')
    t.equal(spycb.callCount, 0, 'spycb not called')
    spy.getCall(0).args[0]()
    t.equal(spycb.callCount, 1, 'spycb called, i.e. was our cb argument')
  })
})

test('test AbstractIterator#next() throws on invalid callback argument', async function (t) {
  t.plan(3 * 2)

  const db = testCommon.factory()
  await db.open()

  for (const invalid of [{}, null, 'foo']) {
    const it = new AbstractIterator(db, {})

    try {
      it.next(invalid)
    } catch (err) {
      t.is(err.name, 'TypeError')
      t.is(err.message, 'The first argument must be a function or undefined')
    }
  }
})

test('test AbstractIterator throws when accessing legacy properties', async function (t) {
  t.plan(3 * 2)

  const db = testCommon.factory()
  await db.open()
  const it = new AbstractIterator(db, {})

  for (const k of ['_ended property', '_nexting property', '_end method']) {
    try {
      // eslint-disable-next-line no-unused-expressions
      it[k.split(' ')[0]]
    } catch (err) {
      t.is(err.message, `The ${k} has been removed`)
    }

    try {
      it[k.split(' ')[0]] = 123
    } catch (err) {
      t.is(err.message, `The ${k} has been removed`)
    }
  }
})

test('test AbstractIterator#close() extensibility', function (t) {
  t.plan(4)

  const spy = sinon.spy()
  const expectedCb = function () {}
  const Test = implement(AbstractIterator, { _close: spy })
  const db = testCommon.factory()

  db.once('open', function () {
    const test = new Test(db, {})

    test.close(expectedCb)

    t.equal(spy.callCount, 1, 'got _close() call')
    t.equal(spy.getCall(0).thisValue, test, '`this` on _close() was correct')
    t.equal(spy.getCall(0).args.length, 1, 'got one arguments')
    t.is(typeof spy.getCall(0).args[0], 'function', 'got cb argument')
  })
})

test('test clear() extensibility', function (t) {
  t.plan(7 * 5)

  const spy = sinon.spy()
  const Test = implement(AbstractLevelDOWN, { _clear: spy })
  const db = new Test({ encodings: { utf8: true } })
  const callback = function () {}

  db.once('open', function () {
    call([callback], { keyEncoding: 'utf8', reverse: false, limit: -1 })
    call([null, callback], { keyEncoding: 'utf8', reverse: false, limit: -1 })
    call([undefined, callback], { keyEncoding: 'utf8', reverse: false, limit: -1 })
    call([{ custom: 1 }, callback], { custom: 1, keyEncoding: 'utf8', reverse: false, limit: -1 })
    call([{ reverse: true, limit: 0 }, callback], { keyEncoding: 'utf8', reverse: true, limit: 0 })
    call([{ reverse: 1 }, callback], { keyEncoding: 'utf8', reverse: true, limit: -1 })
    call([{ reverse: null }, callback], { keyEncoding: 'utf8', reverse: false, limit: -1 })

    function call (args, expectedOptions) {
      db.clear.apply(db, args)

      t.is(spy.callCount, 1, 'got _clear() call')
      t.is(spy.getCall(0).thisValue, db, '`this` on _clear() was correct')
      t.is(spy.getCall(0).args.length, 2, 'got two arguments')
      t.same(spy.getCall(0).args[0], expectedOptions, 'got expected options argument')
      t.is(typeof spy.getCall(0).args[1], 'function', 'got callback argument')

      spy.resetHistory()
    }
  })
})

// TODO: update or remove (ser.)
test.skip('test serialization extensibility (get)', function (t) {
  t.plan(2)

  const spy = sinon.spy()
  const Test = implement(AbstractLevelDOWN, {
    _get: spy,
    _serializeKey: function (key) {
      return key.toUpperCase()
    }
  })

  const test = new Test({ encodings: { utf8: true } }, { keyEncoding: 'utf8' })

  test.once('open', function () {
    test.get('foo', function () {})

    t.is(spy.callCount, 1, 'got _get() call')
    t.is(spy.getCall(0).args[0], 'FOO', 'got expected key argument')
  })
})

// TODO: update or remove (ser.)
test.skip('test serialization extensibility (getMany)', function (t) {
  t.plan(2)

  const spy = sinon.spy()
  const Test = implement(AbstractLevelDOWN, {
    _getMany: spy,
    _serializeKey: function (key) {
      return key.toUpperCase()
    }
  })

  const test = new Test({ encodings: { utf8: true } })

  test.once('open', function () {
    test.getMany(['foo', 'bar'], function () {})

    t.is(spy.callCount, 1, 'got _getMany() call')
    t.same(spy.getCall(0).args[0], ['FOO', 'BAR'], 'got expected keys argument')
  })
})

// TODO: update or remove (ser.)
test.skip('test serialization extensibility (put)', function (t) {
  t.plan(5)

  const spy = sinon.spy()
  const Test = implement(AbstractLevelDOWN, {
    _put: spy,
    _serializeKey: function (key) {
      t.equal(key, 'no')
      return 'foo'
    },

    _serializeValue: function (value) {
      t.equal(value, 'nope')
      return 'bar'
    }
  })

  const test = new Test({ encodings: { utf8: true } })

  test.once('open', function () {
    test.put('no', 'nope', function () {})

    t.equal(spy.callCount, 1, 'got _put() call')
    t.equal(spy.getCall(0).args[0], 'foo', 'got expected key argument')
    t.equal(spy.getCall(0).args[1], 'bar', 'got expected value argument')
  })
})

// TODO: update or remove (ser.)
test.skip('test serialization extensibility (del)', function (t) {
  t.plan(3)

  const spy = sinon.spy()
  const Test = implement(AbstractLevelDOWN, {
    _del: spy,
    _serializeKey: function (key) {
      t.equal(key, 'no')
      return 'foo'
    },
    _serializeValue: function (value) {
      t.fail('should not be called')
    }
  })

  const test = new Test({ encodings: { utf8: true } })

  test.once('open', function () {
    test.del('no', function () {})

    t.equal(spy.callCount, 1, 'got _del() call')
    t.equal(spy.getCall(0).args[0], 'foo', 'got expected key argument')
  })
})

// TODO: update or remove (ser.)
test.skip('test serialization extensibility (batch array put)', function (t) {
  t.plan(5)

  const spy = sinon.spy()
  const Test = implement(AbstractLevelDOWN, {
    _batch: spy,
    _serializeKey: function (key) {
      t.equal(key, 'no')
      return 'foo'
    },
    _serializeValue: function (value) {
      t.equal(value, 'nope')
      return 'bar'
    }
  })

  const test = new Test({ encodings: { utf8: true } })

  test.once('open', function () {
    test.batch([{ type: 'put', key: 'no', value: 'nope' }], function () {})

    t.equal(spy.callCount, 1, 'got _batch() call')
    t.equal(spy.getCall(0).args[0][0].key, 'foo', 'got expected key')
    t.equal(spy.getCall(0).args[0][0].value, 'bar', 'got expected value')
  })
})

// TODO: update or remove (ser.)
test.skip('test serialization extensibility (batch chain put)', function (t) {
  t.plan(5)

  const spy = sinon.spy()
  const Test = implement(AbstractLevelDOWN, {
    _batch: spy,
    _serializeKey: function (key) {
      t.equal(key, 'no')
      return 'foo'
    },
    _serializeValue: function (value) {
      t.equal(value, 'nope')
      return 'bar'
    }
  })

  const test = new Test({ encodings: { utf8: true } })

  test.once('open', function () {
    test.batch().put('no', 'nope').write(function () {})

    t.equal(spy.callCount, 1, 'got _batch() call')
    t.equal(spy.getCall(0).args[0][0].key, 'foo', 'got expected key')
    t.equal(spy.getCall(0).args[0][0].value, 'bar', 'got expected value')
  })
})

// TODO: update or remove (ser.)
test.skip('test serialization extensibility (batch array del)', function (t) {
  t.plan(3)

  const spy = sinon.spy()
  const Test = implement(AbstractLevelDOWN, {
    _batch: spy,
    _serializeKey: function (key) {
      t.equal(key, 'no')
      return 'foo'
    },
    _serializeValue: function (value) {
      t.fail('should not be called')
    }
  })

  const test = new Test({ encodings: { utf8: true } })

  test.once('open', function () {
    test.batch([{ type: 'del', key: 'no' }], function () {})

    t.equal(spy.callCount, 1, 'got _batch() call')
    t.equal(spy.getCall(0).args[0][0].key, 'foo', 'got expected key')
  })
})

// TODO: update or remove (ser.)
test.skip('test serialization extensibility (batch chain del)', function (t) {
  t.plan(3)

  const spy = sinon.spy()
  const Test = implement(AbstractLevelDOWN, {
    _batch: spy,
    _serializeKey: function (key) {
      t.equal(key, 'no')
      return 'foo'
    },
    _serializeValue: function (value) {
      t.fail('should not be called')
    }
  })

  const test = new Test({ encodings: { utf8: true } })

  test.once('open', function () {
    test.batch().del('no').write(function () {})

    t.equal(spy.callCount, 1, 'got _batch() call')
    t.equal(spy.getCall(0).args[0][0].key, 'foo', 'got expected key')
  })
})

// TODO: update or remove (ser.)
test.skip('test serialization extensibility (batch array is not mutated)', function (t) {
  t.plan(7)

  const spy = sinon.spy()
  const Test = implement(AbstractLevelDOWN, {
    _batch: spy,
    _serializeKey: function (key) {
      t.equal(key, 'no')
      return 'foo'
    },
    _serializeValue: function (value) {
      t.equal(value, 'nope')
      return 'bar'
    }
  })

  const test = new Test({ encodings: { utf8: true } })

  test.once('open', function () {
    const op = { type: 'put', key: 'no', value: 'nope' }

    test.batch([op], function () {})

    t.equal(spy.callCount, 1, 'got _batch() call')
    t.equal(spy.getCall(0).args[0][0].key, 'foo', 'got expected key')
    t.equal(spy.getCall(0).args[0][0].value, 'bar', 'got expected value')

    t.equal(op.key, 'no', 'did not mutate input key')
    t.equal(op.value, 'nope', 'did not mutate input value')
  })
})

// TODO: update or remove (ser.)
test.skip('test serialization extensibility (iterator range options)', function (t) {
  t.plan(2)

  function Test () {
    AbstractLevelDOWN.call(this)
  }

  inherits(Test, AbstractLevelDOWN)

  Test.prototype._serializeKey = function (key) {
    t.is(key, 'input')
    return 'output'
  }

  Test.prototype._iterator = function (options) {
    return new Iterator(this, options)
  }

  function Iterator (db, options) {
    AbstractIterator.call(this, db)
    t.is(options.gt, 'output')
  }

  inherits(Iterator, AbstractIterator)

  const test = new Test({ encodings: { utf8: true } })

  test.once('open', function () {
    test.iterator({ gt: 'input' })
  })
})

// TODO: update or remove (ser.)
test.skip('test serialization extensibility (iterator seek)', function (t) {
  t.plan(3)

  const spy = sinon.spy()
  const TestIterator = implement(AbstractIterator, { _seek: spy })

  const Test = implement(AbstractLevelDOWN, {
    _iterator: function () {
      return new TestIterator(this)
    },
    _serializeKey: function (key) {
      t.equal(key, 'target')
      return 'serialized'
    }
  })

  const test = new Test({ encodings: { utf8: true } })

  test.once('open', function () {
    const it = test.iterator()

    it.seek('target')

    t.equal(spy.callCount, 1, 'got _seek() call')
    t.equal(spy.getCall(0).args[0], 'serialized', 'got expected target argument')
  })
})

// TODO: update or remove (ser.)
test.skip('test serialization extensibility (clear range options)', function (t) {
  t.plan(rangeOptions.length * 2)

  rangeOptions.forEach(function (key) {
    const Test = implement(AbstractLevelDOWN, {
      _serializeKey: function (key) {
        t.is(key, 'input')
        return 'output'
      },
      _clear: function (options, callback) {
        t.is(options[key], 'output')
      }
    })

    const db = new Test({ encodings: { utf8: true } })
    const options = {}

    options[key] = 'input'

    db.once('open', function () {
      db.clear(options, function () {})
    })
  })
})

test('clear() does not delete empty or nullish range options', function (t) {
  const rangeValues = [Uint8Array.from([]), '', null, undefined]

  t.plan(rangeOptions.length * rangeValues.length)

  rangeValues.forEach(function (value) {
    const Test = implement(AbstractLevelDOWN, {
      _clear: function (options, callback) {
        rangeOptions.forEach(function (key) {
          t.ok(key in options, key + ' option should not be deleted')
        })
      }
    })

    const db = new Test({ encodings: { utf8: true } })
    const options = {}

    rangeOptions.forEach(function (key) {
      options[key] = value
    })

    db.once('open', function () {
      db.clear(options, function () {})
    })
  })
})

// TODO: some of these are redundant
test('.status', function (t) {
  t.plan(5)

  t.test('empty prototype', function (t) {
    const Test = implement(AbstractLevelDOWN)
    const test = new Test({ encodings: { utf8: true } })

    t.equal(test.status, 'opening')

    test.open(function (err) {
      t.error(err)
      t.equal(test.status, 'open')

      test.close(function (err) {
        t.error(err)
        t.equal(test.status, 'closed')
        t.end()
      })
    })

    t.equal(test.status, 'opening')
  })

  t.test('open error', function (t) {
    const Test = implement(AbstractLevelDOWN, {
      _open: function (options, cb) {
        cb(new Error('_open error'))
      }
    })

    const test = new Test({ encodings: { utf8: true } })

    test.open(function (err) {
      t.is(err && err.message, '_open error')
      t.equal(test.status, 'closed')
      t.end()
    })
  })

  t.test('close error', function (t) {
    const Test = implement(AbstractLevelDOWN, {
      _close: function (cb) {
        cb(new Error('_close error'))
      }
    })

    const test = new Test({ encodings: { utf8: true } })
    test.open(function () {
      test.close(function (err) {
        t.is(err && err.message, '_close error')
        t.equal(test.status, 'open')
        t.end()
      })
    })
  })

  t.test('open', function (t) {
    const Test = implement(AbstractLevelDOWN, {
      _open: function (options, cb) {
        this.nextTick(cb)
      }
    })

    const test = new Test({ encodings: { utf8: true } })
    test.open(function (err) {
      t.error(err)
      t.equal(test.status, 'open')
      t.end()
    })
    t.equal(test.status, 'opening')
  })

  t.test('close', function (t) {
    const Test = implement(AbstractLevelDOWN, {
      _close: function (cb) {
        this.nextTick(cb)
      }
    })

    const test = new Test({ encodings: { utf8: true } })
    test.open(function (err) {
      t.error(err)
      test.close(function (err) {
        t.error(err)
        t.equal(test.status, 'closed')
        t.end()
      })
      t.equal(test.status, 'closing')
    })
  })
})

test('rangeOptions', function (t) {
  const keys = rangeOptions.slice()
  const db = new AbstractLevelDOWN({
    encodings: {
      utf8: true, buffer: true, view: true
    }
  })

  function setupOptions (create) {
    const options = {}
    for (const key of keys) {
      options[key] = create()
    }
    return options
  }

  function verifyOptions (t, options) {
    for (const key of keys) {
      t.ok(key in options, key + ' option should not be deleted')
    }
    t.end()
  }

  t.plan(11)
  t.test('setup', async (t) => db.open())

  t.test('default options', function (t) {
    t.same(getRangeOptions(undefined, db.keyEncoding('utf8')), {
      reverse: false,
      limit: -1
    }, 'correct defaults')
    t.end()
  })

  t.test('set options', function (t) {
    t.same(getRangeOptions({ reverse: false, limit: 20 }, db.keyEncoding('utf8')), {
      reverse: false,
      limit: 20
    }, 'options set correctly')
    t.end()
  })

  t.test('ignores invalid limit', function (t) {
    for (const limit of [Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, NaN, -2, 5.5]) {
      t.same(getRangeOptions({ limit }, db.keyEncoding('utf8')).limit, -1)
    }
    t.end()
  })

  t.test('ignores not-own property', function (t) {
    class Options {}
    Options.prototype.limit = 20
    const options = new Options()

    t.is(options.limit, 20)
    t.same(getRangeOptions(options, db.keyEncoding('utf8')), {
      reverse: false,
      limit: -1
    })
    t.end()
  })

  t.test('does not delete empty buffers', function (t) {
    const options = setupOptions(() => Buffer.alloc(0))
    keys.forEach(function (key) {
      t.is(isBuffer(options[key]), true, 'should be buffer')
      t.is(options[key].byteLength, 0, 'should be empty')
    })
    verifyOptions(t, getRangeOptions(options, db.keyEncoding('buffer')))
  })

  t.test('does not delete empty views', function (t) {
    const options = setupOptions(() => Uint8Array.from([]))
    keys.forEach(function (key) {
      t.is(options[key] instanceof Uint8Array, true, 'should be Uint8Array')
      t.is(options[key].byteLength, 0, 'should be empty')
    })
    verifyOptions(t, getRangeOptions(options, db.keyEncoding('view')))
  })

  t.test('does not delete empty strings', function (t) {
    const options = setupOptions(() => '')
    keys.forEach(function (key) {
      t.is(typeof options[key], 'string', 'should be string')
      t.is(options[key].length, 0, 'should be empty')
    })
    verifyOptions(t, getRangeOptions(options, db.keyEncoding('utf8')))
  })

  t.test('does not delete null', function (t) {
    const options = setupOptions(() => null)
    keys.forEach(function (key) {
      t.is(options[key], null)
    })
    verifyOptions(t, getRangeOptions(options, db.keyEncoding('utf8')))
  })

  t.test('does not delete undefined', function (t) {
    const options = setupOptions(() => undefined)
    keys.forEach(function (key) {
      t.is(options[key], undefined)
    })
    verifyOptions(t, getRangeOptions(options, db.keyEncoding('utf8')))
  })

  t.test('rejects legacy range options', function (t) {
    t.plan(2)

    for (const key of ['start', 'end']) {
      const options = {}
      options[key] = 'x'

      try {
        getRangeOptions(options, db.keyEncoding('utf8'))
      } catch (err) {
        t.is(err.message, 'Legacy range options ("start" and "end") have been removed')
      }
    }
  })
})

require('./self/defer-test')
require('./self/attach-resource-test')
require('./self/deferred-iterator-test')
require('./self/deferred-operations-test')
require('./self/deferred-chained-batch-test')
require('./self/async-iterator-test')
require('./self/encoding-test')
