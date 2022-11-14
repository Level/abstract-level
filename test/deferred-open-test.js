'use strict'

const { DeferredIterator } = require('../lib/deferred-iterator')

exports.all = function (test, testCommon) {
  async function verifyValues (t, db, entries) {
    const promises = []

    for (let i = 1; i <= entries; i++) {
      promises.push(db.get('k' + i).then((v) => {
        t.is(v, 'v' + i, 'value is ok')
        t.is(db.status, 'open', 'status is ok')
      }))
    }

    await Promise.all(promises)
    t.is(await db.get('k' + (entries + 1)), undefined, 'not found')
  }

  // NOTE: copied from levelup
  test('deferred open(): batch() on new database', async function (t) {
    // Create database, opens in next tick
    const db = testCommon.factory()
    const entries = 3
    const ops = []

    // Add entries with batch([]), these should be deferred until the database is actually open
    for (let i = 1; i <= entries; i++) {
      ops.push({ type: 'put', key: 'k' + i, value: 'v' + i })
    }

    t.is(db.status, 'opening')

    await db.batch(ops)
    await verifyValues(t, db, entries)

    return db.close()
  })

  // NOTE: copied from levelup
  test('deferred open(): value of deferred operation is not stringified', async function (t) {
    const db = testCommon.factory({ valueEncoding: 'json' })

    t.is(db.status, 'opening')
    await db.put('key', { thing: 2 })

    t.is(db.status, 'open')
    t.same(await db.get('key'), { thing: 2 })

    return db.close()
  })

  // NOTE: copied from levelup
  test('deferred open(): key of deferred operation is not stringified', async function (t) {
    const db = testCommon.factory({ keyEncoding: 'json' })

    t.is(db.status, 'opening')
    await db.put({ thing: 2 }, 'value')

    t.is(db.status, 'open')
    t.same(await db.keys().all(), [{ thing: 2 }])

    return db.close()
  })

  // NOTE: copied from deferred-leveldown
  // TODO: move to iterator tests, if not already covered there
  test('cannot operate on closed db', async function (t) {
    t.plan(3)

    const db = testCommon.factory()

    await db.open()
    await db.close()

    try {
      db.iterator()
    } catch (err) {
      t.is(err.code, 'LEVEL_DATABASE_NOT_OPEN')
    }

    try {
      db.keys()
    } catch (err) {
      t.is(err.code, 'LEVEL_DATABASE_NOT_OPEN')
    }

    try {
      db.values()
    } catch (err) {
      t.is(err.code, 'LEVEL_DATABASE_NOT_OPEN')
    }
  })

  // NOTE: copied from deferred-leveldown
  // TODO: move to iterator tests, if not already covered there
  test('cannot operate on closing db', async function (t) {
    t.plan(3)

    const db = testCommon.factory()

    await db.open()
    const promise = db.close()

    try {
      db.iterator()
    } catch (err) {
      t.is(err.code, 'LEVEL_DATABASE_NOT_OPEN')
    }

    try {
      db.keys()
    } catch (err) {
      t.is(err.code, 'LEVEL_DATABASE_NOT_OPEN')
    }

    try {
      db.values()
    } catch (err) {
      t.is(err.code, 'LEVEL_DATABASE_NOT_OPEN')
    }

    return promise
  })

  // NOTE: copied from deferred-leveldown
  // TODO: move to iterator tests, if not already covered there
  test('deferred iterator - cannot operate on closed db', async function (t) {
    t.plan(4)

    const db = testCommon.factory()
    const it = db.iterator({ gt: 'foo' })

    await db.open()
    await db.close()

    t.ok(it instanceof DeferredIterator)

    const promises = [
      it.next().catch(function (err) {
        t.is(err.code, 'LEVEL_ITERATOR_NOT_OPEN')
      }),

      it.nextv(10).catch(function (err) {
        t.is(err.code, 'LEVEL_ITERATOR_NOT_OPEN')
      }),

      it.all().catch(function (err) {
        t.is(err.code, 'LEVEL_ITERATOR_NOT_OPEN')
      }),

      // Was already closed
      it.close().catch(function () {
        t.fail('no close() error')
      })
    ]

    try {
      it.seek('foo')
    } catch (err) {
      // Should *not* throw
      t.fail(err)
    }

    return Promise.all(promises)
  })

  // NOTE: copied from deferred-leveldown
  // TODO: move to iterator tests, if not already covered there
  test('deferred iterator - cannot operate on closing db', async function (t) {
    t.plan(4)

    const db = testCommon.factory()
    const it = db.iterator({ gt: 'foo' })

    t.ok(it instanceof DeferredIterator)

    await db.open()
    const promises = [
      db.close(),

      it.next().catch(function (err) {
        t.is(err.code, 'LEVEL_ITERATOR_NOT_OPEN')
      }),

      it.nextv(10).catch(function (err) {
        t.is(err.code, 'LEVEL_ITERATOR_NOT_OPEN')
      }),

      it.all().catch(function (err) {
        t.is(err.code, 'LEVEL_ITERATOR_NOT_OPEN')
      }),

      // Is already closing
      it.close().catch(function () {
        t.fail('no close() error')
      })
    ]

    try {
      it.seek('foo')
    } catch (err) {
      // Should *not* throw
      t.fail(err)
    }

    return Promise.all(promises)
  })
}
