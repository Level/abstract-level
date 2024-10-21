'use strict'

const test = require('tape')
const isBuffer = require('is-buffer')
const { Buffer } = require('buffer')
const { AbstractLevel, AbstractChainedBatch } = require('..')
const { MinimalLevel, createSpy } = require('./util')
const getRangeOptions = require('../lib/range-options')

const testCommon = require('./common')({
  test,
  factory () {
    return new AbstractLevel({ encodings: { utf8: true } })
  }
})

const rangeOptions = ['gt', 'gte', 'lt', 'lte']

function implement (ctor, methods) {
  class Test extends ctor {}

  for (const k in methods) {
    Test.prototype[k] = methods[k]
  }

  return Test
}

/**
 * Extensibility
 */

test('test core extensibility', function (t) {
  const Test = implement(AbstractLevel)
  const test = new Test({ encodings: { utf8: true } })
  t.is(test.status, 'opening', 'status is opening')
  t.end()
})

test('manifest is required', function (t) {
  t.plan(3 * 2)

  const Test = implement(AbstractLevel)

  for (const args of [[], [null], [123]]) {
    try {
      // eslint-disable-next-line no-new
      new Test(...args)
    } catch (err) {
      t.is(err.name, 'TypeError')
      t.is(err.message, "The first argument 'manifest' must be an object")
    }
  }
})

test('test open() extensibility when new', async function (t) {
  const spy = createSpy(async function () {})
  const expectedOptions = { createIfMissing: true, errorIfExists: false }
  const Test = implement(AbstractLevel, { _open: spy })
  const test = new Test({ encodings: { utf8: true } })

  await test.open()

  t.is(spy.callCount, 1, 'got _open() call')
  t.is(spy.getCall(0).thisValue, test, '`this` on _open() was correct')
  t.is(spy.getCall(0).args.length, 1, 'got one argument')
  t.same(spy.getCall(0).args[0], expectedOptions, 'got default options argument')

  const test2 = new Test({ encodings: { utf8: true } })
  await test2.open({ options: 1 })

  expectedOptions.options = 1

  t.is(spy.callCount, 2, 'got _open() call')
  t.is(spy.getCall(1).thisValue, test2, '`this` on _open() was correct')
  t.is(spy.getCall(1).args.length, 1, 'got one argument')
  t.same(spy.getCall(1).args[0], expectedOptions, 'got expected options argument')
})

test('test open() extensibility when open', function (t) {
  t.plan(2)

  const spy = createSpy(async function () {})
  const Test = implement(AbstractLevel, { _open: spy })
  const test = new Test({ encodings: { utf8: true } })

  test.once('open', function () {
    t.is(spy.callCount, 1, 'got _open() call')

    test.open().then(function () {
      t.is(spy.callCount, 1, 'did not get second _open() call')
    })
  })
})

test('test opening explicitly gives a chance to capture an error', async function (t) {
  t.plan(3)

  const spy = createSpy(async function (options) { throw new Error('_open error') })
  const Test = implement(AbstractLevel, { _open: spy })
  const test = new Test({ encodings: { utf8: true } })

  try {
    await test.open()
  } catch (err) {
    t.is(spy.callCount, 1, 'got _open() call')
    t.is(err.code, 'LEVEL_DATABASE_NOT_OPEN')
    t.is(err.cause.message, '_open error')
  }
})

test('test constructor options are forwarded to open()', async function (t) {
  const spy = createSpy(async function (options) { })
  const Test = implement(AbstractLevel, { _open: spy })
  const test = new Test({ encodings: { utf8: true } }, {
    passive: true,
    keyEncoding: 'json',
    valueEncoding: 'json',
    createIfMissing: false,
    foo: 123
  })

  await test.open()

  t.is(spy.callCount, 1, 'got _open() call')
  t.same(spy.getCall(0).args[0], {
    foo: 123,
    createIfMissing: false,
    errorIfExists: false
  }, 'does not forward passive, keyEncoding and valueEncoding options')
})

test('test close() extensibility when open', async function (t) {
  const spy = createSpy(async function () {})
  const Test = implement(AbstractLevel, { _close: spy })
  const test = new Test({ encodings: { utf8: true } })

  await test.open()
  await test.close()

  t.is(spy.callCount, 1, 'got _close() call')
  t.is(spy.getCall(0).thisValue, test, '`this` on _close() was correct')
  t.is(spy.getCall(0).args.length, 0, 'got 0 arguments')
})

test('test close() extensibility when new', async function (t) {
  const spy = createSpy(async function () {})
  const Test = implement(AbstractLevel, { _close: spy })
  const test = new Test({ encodings: { utf8: true } })

  await test.close()
  t.is(spy.callCount, 0, 'not called because _open was never called')
})

test('test open(), close(), open() with twice failed open', function (t) {
  t.plan(7)

  const db = testCommon.factory()
  const order = []

  let opens = 0

  db.on('open', t.fail.bind(t))
  db.on('closed', t.fail.bind(t))

  db._open = async function (options) {
    t.pass('called')
    throw new Error('test' + (++opens))
  }

  db._close = async function () {
    t.fail('should not be called')
  }

  db.open().then(t.fail.bind(t), function (err) {
    t.is(err.code, 'LEVEL_DATABASE_NOT_OPEN')
    t.is(err.cause && err.cause.message, 'test1')
    order.push('A')
  })

  db.close().then(function () {
    order.push('B')
  })

  db.open().then(t.fail.bind(t), function (err) {
    t.is(err.code, 'LEVEL_DATABASE_NOT_OPEN')
    t.is(err.cause && err.cause.message, 'test2')
    order.push('C')
    t.same(order, ['A', 'B', 'C'], 'order is ok')
  })
})

test('test open(), close(), open() with first failed open', function (t) {
  t.plan(6)

  const db = testCommon.factory()
  const order = []

  let opens = 0

  db.on('open', () => { order.push('open event') })
  db.on('closed', t.fail.bind(t, 'should not emit closed'))

  db._open = async function (options) {
    t.pass('called')
    if (!opens++) throw new Error('test')
  }

  db.open().then(t.fail.bind(t, 'should not open'), function (err) {
    t.is(err.code, 'LEVEL_DATABASE_NOT_OPEN')
    t.is(db.status, 'closed')
    order.push('A')
  })

  db.close().then(function () {
    // Status is actually 'opening' due to the parallel open() call, which starts
    // its work after close() finished but before this then() handler. Can't be helped.
    // t.is(db.status, 'closed')

    order.push('B')
  })

  db.open().then(function () {
    t.is(db.status, 'open')
    order.push('C')
    t.same(order, ['A', 'B', 'open event', 'C'], 'order is ok')
  })
})

test('test open(), close(), open() with second failed open', function (t) {
  t.plan(8)

  const db = testCommon.factory()
  const order = []

  let opens = 0

  db.on('open', () => order.push('open event'))
  db.on('closed', () => order.push('closed event'))

  db._open = async function (options) {
    t.pass('called')
    if (opens++) throw new Error('test')
  }

  db.open().then(function () {
    t.is(db.status, 'open')
    order.push('A')
  })

  db.close().then(function () {
    t.is(db.status, 'closed')
    order.push('B')
  })

  db.open().then(t.fail.bind(t, 'should not open'), function (err) {
    t.is(err.code, 'LEVEL_DATABASE_NOT_OPEN')
    t.is(err.cause.message, 'test')
    t.is(db.status, 'closed')
    order.push('C')
    t.same(order, ['open event', 'A', 'closed event', 'B', 'C'], 'order is ok')
  })
})

test('open() error is combined with resource error', async function (t) {
  t.plan(4)

  const db = testCommon.factory()
  const resource = db.iterator()

  db._open = async function (options) {
    throw new Error('error from open')
  }

  resource.close = async function () {
    throw new Error('error from resource')
  }

  try {
    await db.open()
  } catch (err) {
    t.is(db.status, 'closed')
    t.is(err.code, 'LEVEL_DATABASE_NOT_OPEN')
    t.is(err.cause.name, 'CombinedError')
    t.is(err.cause.message, 'error from open; error from resource')
  }
})

test('test get() extensibility', async function (t) {
  const spy = createSpy(async function () {})
  const expectedOptions = { keyEncoding: 'utf8', valueEncoding: 'utf8' }
  const expectedKey = 'a key'
  const Test = implement(AbstractLevel, { _get: spy })
  const test = new Test({ encodings: { utf8: true } }, { keyEncoding: 'utf8' })

  await test.open()
  await test.get(expectedKey)

  t.is(spy.callCount, 1, 'got _get() call')
  t.is(spy.getCall(0).thisValue, test, '`this` on _get() was correct')
  t.is(spy.getCall(0).args.length, 2, 'got 2 arguments')
  t.is(spy.getCall(0).args[0], expectedKey, 'got expected key argument')
  t.same(spy.getCall(0).args[1], expectedOptions, 'got default options argument')

  await test.get(expectedKey, { options: 1 })
  expectedOptions.options = 1

  t.is(spy.callCount, 2, 'got _get() call')
  t.is(spy.getCall(1).thisValue, test, '`this` on _get() was correct')
  t.is(spy.getCall(1).args.length, 2, 'got 2 arguments')
  t.is(spy.getCall(1).args[0], expectedKey, 'got expected key argument')
  t.same(spy.getCall(1).args[1], expectedOptions, 'got expected options argument')
})

test('test getMany() extensibility', async function (t) {
  const spy = createSpy(async () => ['x'])
  const expectedOptions = { keyEncoding: 'utf8', valueEncoding: 'utf8' }
  const expectedKey = 'a key'
  const Test = implement(AbstractLevel, { _getMany: spy })
  const test = new Test({ encodings: { utf8: true } })

  await test.open()
  await test.getMany([expectedKey])

  t.is(spy.callCount, 1, 'got _getMany() call')
  t.is(spy.getCall(0).thisValue, test, '`this` on _getMany() was correct')
  t.is(spy.getCall(0).args.length, 2, 'got 2 arguments')
  t.same(spy.getCall(0).args[0], [expectedKey], 'got expected keys argument')
  t.same(spy.getCall(0).args[1], expectedOptions, 'got default options argument')

  await test.getMany([expectedKey], { options: 1 })
  expectedOptions.options = 1

  t.is(spy.callCount, 2, 'got _getMany() call')
  t.is(spy.getCall(1).thisValue, test, '`this` on _getMany() was correct')
  t.is(spy.getCall(1).args.length, 2, 'got 2 arguments')
  t.same(spy.getCall(1).args[0], [expectedKey], 'got expected key argument')
  t.same(spy.getCall(1).args[1], expectedOptions, 'got expected options argument')
})

test('test del() extensibility', async function (t) {
  const spy = createSpy(async function () {})
  const expectedOptions = { options: 1, keyEncoding: 'utf8' }
  const expectedKey = 'a key'
  const Test = implement(AbstractLevel, { _del: spy })
  const test = new Test({ encodings: { utf8: true } })

  await test.open()
  await test.del(expectedKey)

  t.is(spy.callCount, 1, 'got _del() call')
  t.is(spy.getCall(0).thisValue, test, '`this` on _del() was correct')
  t.is(spy.getCall(0).args.length, 2, 'got 2 arguments')
  t.is(spy.getCall(0).args[0], expectedKey, 'got expected key argument')
  t.same(spy.getCall(0).args[1], { keyEncoding: 'utf8' }, 'got blank options argument')

  await test.del(expectedKey, expectedOptions)

  t.is(spy.callCount, 2, 'got _del() call')
  t.is(spy.getCall(1).thisValue, test, '`this` on _del() was correct')
  t.is(spy.getCall(1).args.length, 2, 'got 2 arguments')
  t.is(spy.getCall(1).args[0], expectedKey, 'got expected key argument')
  t.same(spy.getCall(1).args[1], expectedOptions, 'got expected options argument')
})

test('test put() extensibility', async function (t) {
  const spy = createSpy(async function () {})
  const expectedOptions = { options: 1, keyEncoding: 'utf8', valueEncoding: 'utf8' }
  const expectedKey = 'a key'
  const expectedValue = 'a value'
  const Test = implement(AbstractLevel, { _put: spy })
  const test = new Test({ encodings: { utf8: true } })

  await test.open()
  await test.put(expectedKey, expectedValue)

  t.is(spy.callCount, 1, 'got _put() call')
  t.is(spy.getCall(0).thisValue, test, '`this` on _put() was correct')
  t.is(spy.getCall(0).args.length, 3, 'got 3 arguments')
  t.is(spy.getCall(0).args[0], expectedKey, 'got expected key argument')
  t.is(spy.getCall(0).args[1], expectedValue, 'got expected value argument')
  t.same(spy.getCall(0).args[2], { keyEncoding: 'utf8', valueEncoding: 'utf8' }, 'got default options argument')

  await test.put(expectedKey, expectedValue, expectedOptions)

  t.is(spy.callCount, 2, 'got _put() call')
  t.is(spy.getCall(1).thisValue, test, '`this` on _put() was correct')
  t.is(spy.getCall(1).args.length, 3, 'got 3 arguments')
  t.is(spy.getCall(1).args[0], expectedKey, 'got expected key argument')
  t.is(spy.getCall(1).args[1], expectedValue, 'got expected value argument')
  t.same(spy.getCall(1).args[2], expectedOptions, 'got expected options argument')
})

test('batch([]) extensibility', async function (t) {
  const spy = createSpy(async function () {})
  const expectedOptions = { options: 1 }
  const expectedArray = [
    { type: 'put', key: '1', value: '1', keyEncoding: 'utf8', valueEncoding: 'utf8' },
    { type: 'del', key: '2', keyEncoding: 'utf8' }
  ]
  const Test = implement(AbstractLevel, { _batch: spy })
  const test = new Test({ encodings: { utf8: true } })

  await test.open()
  await test.batch(expectedArray)

  t.is(spy.callCount, 1, 'got _batch() call')
  t.is(spy.getCall(0).thisValue, test, '`this` on _batch() was correct')
  t.is(spy.getCall(0).args.length, 2, 'got 2 arguments')
  t.same(spy.getCall(0).args[0], expectedArray, 'got expected array argument')
  t.same(spy.getCall(0).args[1], {}, 'got expected options argument')

  await test.batch(expectedArray, expectedOptions)

  t.is(spy.callCount, 2, 'got _batch() call')
  t.is(spy.getCall(1).thisValue, test, '`this` on _batch() was correct')
  t.is(spy.getCall(1).args.length, 2, 'got 2 arguments')
  t.same(spy.getCall(1).args[0], expectedArray.map(o => ({ ...expectedOptions, ...o })), 'got expected array argument')
  t.same(spy.getCall(1).args[1], expectedOptions, 'got expected options argument')

  await test.batch(expectedArray, null)

  t.is(spy.callCount, 3, 'got _batch() call')
  t.is(spy.getCall(2).thisValue, test, '`this` on _batch() was correct')
  t.is(spy.getCall(2).args.length, 2, 'got 2 arguments')
  t.same(spy.getCall(2).args[0], expectedArray, 'got expected array argument')
  t.ok(spy.getCall(2).args[1], 'options should not be null')
})

test('batch([]) with empty array is a noop', function (t) {
  t.plan(1)

  const spy = createSpy()
  const Test = implement(AbstractLevel, { _batch: spy })
  const test = new Test({ encodings: { utf8: true } })

  test.once('open', function () {
    test.batch([]).then(function () {
      t.is(spy.callCount, 0, '_batch() call was bypassed')
    })
  })
})

test('test chained batch() extensibility', async function (t) {
  const spy = createSpy(async function () {})
  const expectedOptions = { options: 1 }
  const Test = implement(AbstractLevel, { _batch: spy })
  const test = new Test({ encodings: { utf8: true } })

  await test.open()
  await test.batch().put('foo', 'bar').del('bang').write()

  t.is(spy.callCount, 1, 'got _batch() call')
  t.is(spy.getCall(0).thisValue, test, '`this` on _batch() was correct')
  t.is(spy.getCall(0).args.length, 2, 'got 2 arguments')
  t.is(spy.getCall(0).args[0].length, 2, 'got expected array argument')
  t.same(spy.getCall(0).args[0][0], { keyEncoding: 'utf8', valueEncoding: 'utf8', type: 'put', key: 'foo', value: 'bar' }, 'got expected array argument[0]')
  t.same(spy.getCall(0).args[0][1], { keyEncoding: 'utf8', type: 'del', key: 'bang' }, 'got expected array argument[1]')
  t.same(spy.getCall(0).args[1], {}, 'got expected options argument')

  await test.batch().put('foo', 'bar', expectedOptions).del('bang', expectedOptions).write(expectedOptions)

  t.is(spy.callCount, 2, 'got _batch() call')
  t.is(spy.getCall(1).thisValue, test, '`this` on _batch() was correct')
  t.is(spy.getCall(1).args.length, 2, 'got 2 arguments')
  t.is(spy.getCall(1).args[0].length, 2, 'got expected array argument')
  t.same(spy.getCall(1).args[0][0], { keyEncoding: 'utf8', valueEncoding: 'utf8', type: 'put', key: 'foo', value: 'bar', options: 1 }, 'got expected array argument[0]')
  t.same(spy.getCall(1).args[0][1], { keyEncoding: 'utf8', type: 'del', key: 'bang', options: 1 }, 'got expected array argument[1]')
  t.same(spy.getCall(1).args[1], { options: 1 }, 'got expected options argument')
})

test('test chained batch() with no operations is a noop', function (t) {
  t.plan(1)

  const spy = createSpy(async function () {})
  const Test = implement(AbstractLevel, { _batch: spy })
  const test = new Test({ encodings: { utf8: true } })

  test.once('open', function () {
    test.batch().write().then(function () {
      t.is(spy.callCount, 0, '_batch() call was bypassed')
    })
  })
})

test('test chained batch() (custom _chainedBatch) extensibility', async function (t) {
  const spy = createSpy()
  const Test = implement(AbstractLevel, { _chainedBatch: spy })
  const test = new Test({ encodings: { utf8: true } })

  await test.open()

  test.batch()

  t.is(spy.callCount, 1, 'got _chainedBatch() call')
  t.is(spy.getCall(0).thisValue, test, '`this` on _chainedBatch() was correct')

  test.batch()

  t.is(spy.callCount, 2, 'got _chainedBatch() call')
  t.is(spy.getCall(1).thisValue, test, '`this` on _chainedBatch() was correct')
})

test('test AbstractChainedBatch extensibility', async function (t) {
  const Batch = implement(AbstractChainedBatch)
  const db = testCommon.factory()
  await db.open()
  const test = new Batch(db)
  t.ok(test.db === db, 'instance has db reference')
})

test('test AbstractChainedBatch expects a db', function (t) {
  t.plan(1)

  const Test = implement(AbstractChainedBatch)

  try {
    // eslint-disable-next-line no-new
    new Test()
  } catch (err) {
    t.is(err.message, 'The first argument must be an abstract-level database, received undefined')
  }
})

test('test AbstractChainedBatch#write() extensibility', async function (t) {
  t.plan(2)

  const Test = implement(AbstractChainedBatch, {
    async _write (options) {
      t.same(options, {})
      t.is(this, batch, 'thisArg on _write() is correct')
    }
  })

  const db = testCommon.factory()
  await db.open()
  const batch = new Test(db)

  // Without any operations, _write isn't called
  batch.put('foo', 'bar')
  return batch.write()
})

test('test AbstractChainedBatch#write() extensibility with null options', async function (t) {
  t.plan(2)

  const Test = implement(AbstractChainedBatch, {
    async _write (options) {
      t.same(options, {})
      t.is(this, batch, 'thisArg on _write() is correct')
    }
  })

  const db = testCommon.factory()
  await db.open()
  const batch = new Test(db)

  // Without any operations, _write isn't called
  batch.put('foo', 'bar')
  return batch.write(null)
})

test('test AbstractChainedBatch#write() extensibility with options', async function (t) {
  t.plan(2)

  const Test = implement(AbstractChainedBatch, {
    async _write (options) {
      t.same(options, { test: true })
      t.is(this, batch, 'thisArg on _write() is correct')
    }
  })

  const db = testCommon.factory()
  await db.open()
  const batch = new Test(db)

  // Without any operations, _write isn't called
  batch.put('foo', 'bar')
  return batch.write({ test: true })
})

test('test AbstractChainedBatch#put() extensibility', function (t) {
  t.plan(8)

  const spy = createSpy()
  const expectedKey = 'key'
  const expectedValue = 'value'
  const Test = implement(AbstractChainedBatch, { _put: spy })
  const db = testCommon.factory()

  db.once('open', function () {
    const test = new Test(db)
    const returnValue = test.put(expectedKey, expectedValue)

    t.is(spy.callCount, 1, 'got _put call')
    t.is(spy.getCall(0).thisValue, test, '`this` on _put() was correct')
    t.is(spy.getCall(0).args.length, 3, 'got 3 arguments')
    t.is(spy.getCall(0).args[0], expectedKey, 'got expected key argument')
    t.is(spy.getCall(0).args[1], expectedValue, 'got expected value argument')

    // May contain more options, just because it's cheaper to not remove them
    t.is(spy.getCall(0).args[2].keyEncoding, 'utf8', 'got expected keyEncoding option')
    t.is(spy.getCall(0).args[2].valueEncoding, 'utf8', 'got expected valueEncoding option')

    t.is(returnValue, test, 'get expected return value')
  })
})

test('test AbstractChainedBatch#del() extensibility', function (t) {
  t.plan(6)

  const spy = createSpy()
  const expectedKey = 'key'
  const Test = implement(AbstractChainedBatch, { _del: spy })
  const db = testCommon.factory()

  db.once('open', function () {
    const test = new Test(db)
    const returnValue = test.del(expectedKey)

    t.is(spy.callCount, 1, 'got _del call')
    t.is(spy.getCall(0).thisValue, test, '`this` on _del() was correct')
    t.is(spy.getCall(0).args.length, 2, 'got 2 arguments')
    t.is(spy.getCall(0).args[0], expectedKey, 'got expected key argument')

    // May contain more options, just because it's cheaper to not remove them
    t.is(spy.getCall(0).args[1].keyEncoding, 'utf8', 'got expected keyEncoding option')

    t.is(returnValue, test, 'get expected return value')
  })
})

test('test AbstractChainedBatch#clear() extensibility', function (t) {
  t.plan(4)

  const spy = createSpy()
  const Test = implement(AbstractChainedBatch, { _clear: spy })
  const db = testCommon.factory()

  db.once('open', function () {
    const test = new Test(db)
    const returnValue = test.clear()

    t.is(spy.callCount, 1, 'got _clear call')
    t.is(spy.getCall(0).thisValue, test, '`this` on _clear() was correct')
    t.is(spy.getCall(0).args.length, 0, 'got zero arguments')
    t.is(returnValue, test, 'get expected return value')
  })
})

test('test clear() extensibility', async function (t) {
  t.plan((7 * 4) - 3)

  const spy = createSpy()
  const Test = implement(AbstractLevel, { _clear: spy })
  const db = new Test({ encodings: { utf8: true } })

  await db.open()

  call([], { keyEncoding: 'utf8', reverse: false, limit: -1 })
  call([null], { keyEncoding: 'utf8', reverse: false, limit: -1 })
  call([undefined], { keyEncoding: 'utf8', reverse: false, limit: -1 })
  call([{ custom: 1 }], { custom: 1, keyEncoding: 'utf8', reverse: false, limit: -1 })
  call([{ reverse: true, limit: 0 }], { keyEncoding: 'utf8', reverse: true, limit: 0 }, true)
  call([{ reverse: 1 }], { keyEncoding: 'utf8', reverse: true, limit: -1 })
  call([{ reverse: null }], { keyEncoding: 'utf8', reverse: false, limit: -1 })

  function call (args, expectedOptions, shouldSkipCall) {
    db.clear.apply(db, args).catch(t.fail.bind(t))

    t.is(spy.callCount, shouldSkipCall ? 0 : 1, 'got _clear() call')

    if (!shouldSkipCall) {
      t.is(spy.getCall(0).thisValue, db, '`this` on _clear() was correct')
      t.is(spy.getCall(0).args.length, 1, 'got 1 argument')
      t.same(spy.getCall(0).args[0], expectedOptions, 'got expected options argument')
    }

    spy.resetHistory()
  }
})

// TODO: replace with encoding test
test.skip('test serialization extensibility (batch array is not mutated)', function (t) {
  t.plan(7)

  const spy = createSpy()
  const Test = implement(AbstractLevel, {
    _batch: spy,
    _serializeKey: function (key) {
      t.is(key, 'no')
      return 'foo'
    },
    _serializeValue: function (value) {
      t.is(value, 'nope')
      return 'bar'
    }
  })

  const test = new Test({ encodings: { utf8: true } })

  test.once('open', function () {
    const op = { type: 'put', key: 'no', value: 'nope' }

    test.batch([op], function () {})

    t.is(spy.callCount, 1, 'got _batch() call')
    t.is(spy.getCall(0).args[0][0].key, 'foo', 'got expected key')
    t.is(spy.getCall(0).args[0][0].value, 'bar', 'got expected value')

    t.is(op.key, 'no', 'did not mutate input key')
    t.is(op.value, 'nope', 'did not mutate input value')
  })
})

test('clear() does not delete empty or nullish range options', function (t) {
  const rangeValues = [Uint8Array.from([]), '', null, undefined]

  t.plan(rangeOptions.length * rangeValues.length)

  rangeValues.forEach(function (value) {
    const Test = implement(AbstractLevel, {
      async _clear (options) {
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
      db.clear(options).catch(t.fail.bind(t))
    })
  })
})

test('open error', function (t) {
  t.plan(3)

  const Test = implement(AbstractLevel, {
    async _open (options) {
      throw new Error('_open error')
    }
  })

  const test = new Test({ encodings: { utf8: true } })

  test.open().then(t.fail.bind(t), function (err) {
    t.is(err.code, 'LEVEL_DATABASE_NOT_OPEN')
    t.is(err.cause && err.cause.message, '_open error')
    t.is(test.status, 'closed')
  })
})

test('close error', function (t) {
  t.plan(3)

  const Test = implement(AbstractLevel, {
    async _close () {
      throw new Error('_close error')
    }
  })

  const test = new Test({ encodings: { utf8: true } })
  test.open().then(function () {
    test.close().then(t.fail.bind(t), function (err) {
      t.is(err.code, 'LEVEL_DATABASE_NOT_CLOSED')
      t.is(err.cause && err.cause.message, '_close error')
      t.is(test.status, 'open')
    })
  })
})

test('rangeOptions', function (t) {
  const keys = rangeOptions.slice()
  const db = new AbstractLevel({
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

  t.plan(10)
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
    // Infinity is valid but is normalized to -1 for use in private API
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
})

require('./self/deferred-queue-test')
require('./self/errors-test')
require('./self/defer-test')
require('./self/attach-resource-test')
require('./self/abstract-iterator-test')
require('./self/iterator-test')
require('./self/deferred-iterator-test')
require('./self/deferred-operations-test')
require('./self/async-iterator-test')
require('./self/encoding-test')
require('./self/sublevel-test')

// Test the abstract test suite using a minimal implementation
require('./index')({
  test,
  factory (options) {
    return new MinimalLevel(options)
  }
})
