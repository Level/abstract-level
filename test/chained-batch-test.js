'use strict'

let db

exports.setUp = function (test, testCommon) {
  test('chained batch setup', async function (t) {
    db = testCommon.factory()
    return db.open()
  })
}

exports.args = function (test, testCommon) {
  test('chained batch has db reference', async function (t) {
    const batch = db.batch()
    t.ok(batch.db === db)
    return batch.close()
  })

  test('chained batch.put() with missing or nullish value fails', async function (t) {
    t.plan(3 * 2)

    for (const args of [[null], [undefined], []]) {
      const batch = db.batch()

      try {
        batch.put('key', ...args)
      } catch (err) {
        t.is(err.code, 'LEVEL_INVALID_VALUE', 'correct error code')
        t.is(batch.length, 0, 'length is not incremented on error')
      }

      await batch.close()
    }
  })

  test('chained batch.put() with missing of nullish key fails', async function (t) {
    t.plan(3 * 2)

    for (const args of [[], [null, 'foo'], [undefined, 'foo']]) {
      const batch = db.batch()

      try {
        batch.put(...args)
      } catch (err) {
        t.is(err.code, 'LEVEL_INVALID_KEY', 'correct error code')
        t.is(batch.length, 0, 'length is not incremented on error')
      }

      await batch.close()
    }
  })

  test('chained batch.del() with missing or nullish key fails', async function (t) {
    t.plan(3 * 2)

    for (const args of [[null], [undefined], []]) {
      const batch = db.batch()

      try {
        batch.del(...args)
      } catch (err) {
        t.is(err.code, 'LEVEL_INVALID_KEY', 'correct error code')
        t.is(batch.length, 0, 'length is not incremented on error')
      }

      await batch.close()
    }
  })

  test('chained batch.clear() does not throw if empty', async function (t) {
    return db.batch().clear().close()
  })

  test('chained batch.put() after write() fails', async function (t) {
    t.plan(1)

    const batch = db.batch().put('foo', 'bar')
    await batch.write()

    try {
      batch.put('boom', 'bang')
    } catch (err) {
      t.is(err.code, 'LEVEL_BATCH_NOT_OPEN', 'correct error code')
    }
  })

  test('chained batch.del() after write() fails', async function (t) {
    t.plan(1)

    const batch = db.batch().put('foo', 'bar')
    await batch.write()

    try {
      batch.del('foo')
    } catch (err) {
      t.is(err.code, 'LEVEL_BATCH_NOT_OPEN', 'correct error code')
    }
  })

  test('chained batch.clear() after write() fails', async function (t) {
    t.plan(1)

    const batch = db.batch().put('foo', 'bar')
    await batch.write()

    try {
      batch.clear()
    } catch (err) {
      t.is(err.code, 'LEVEL_BATCH_NOT_OPEN', 'correct error code')
    }
  })

  test('chained batch.write() after write() fails', async function (t) {
    t.plan(1)

    const batch = db.batch().put('foo', 'bar')
    await batch.write()

    try {
      await batch.write()
    } catch (err) {
      t.is(err.code, 'LEVEL_BATCH_NOT_OPEN', 'correct error code')
    }
  })

  test('chained batch.write() after close() fails', async function (t) {
    t.plan(1)

    const batch = db.batch().put('foo', 'bar')
    await batch.close()

    try {
      await batch.write()
    } catch (err) {
      t.is(err.code, 'LEVEL_BATCH_NOT_OPEN', 'correct error code')
    }
  })

  test('chained batch.write() with no operations', async function (t) {
    return db.batch().write()
  })

  test('chained batch.close() with no operations', async function (t) {
    return db.batch().close()
  })

  test('chained batch.close() is idempotent', async function (t) {
    const batch = db.batch()
    await batch.close()
    await batch.close()
    return Promise.all([batch.close(), batch.close()])
  })
}

exports.batch = function (test, testCommon) {
  test('simple chained batch', async function (t) {
    await db.batch([
      { type: 'put', key: 'one', value: '1' },
      { type: 'put', key: 'two', value: '2' },
      { type: 'put', key: 'three', value: '3' }
    ])

    const batch = db.batch()
      .put('1', 'one')
      .del('2', 'two')
      .put('3', 'three')

    t.is(batch.length, 3, 'length was incremented')

    batch.clear()
    t.is(batch.length, 0, 'length is reset')

    batch.put('one', 'I')
      .put('two', 'II')
      .del('three')
      .put('foo', 'bar')

    t.is(batch.length, 4, 'length was incremented')

    await batch.write()

    t.same(await db.iterator().all(), [
      ['foo', 'bar'],
      ['one', 'I'],
      ['two', 'II']
    ])
  })

  test('chained batch requires database to be open', async function (t) {
    t.plan(5)

    const db1 = testCommon.factory()
    const db2 = testCommon.factory()

    try {
      db1.batch()
    } catch (err) {
      t.is(err.code, 'LEVEL_DATABASE_NOT_OPEN')
    }

    await db2.open()
    const batch = db2.batch()
    await db2.close()

    try {
      batch.put('beep', 'boop')
    } catch (err) {
      t.is(err.code, 'LEVEL_BATCH_NOT_OPEN')
    }

    try {
      batch.del('456')
    } catch (err) {
      t.is(err.code, 'LEVEL_BATCH_NOT_OPEN')
    }

    try {
      batch.clear()
    } catch (err) {
      t.is(err.code, 'LEVEL_BATCH_NOT_OPEN')
    }

    try {
      await batch.write()
    } catch (err) {
      t.is(err.code, 'LEVEL_BATCH_NOT_OPEN')
    }

    // Should be a noop (already closed)
    await batch.close()

    return Promise.all([db1.close(), db2.close()])
  })

  // NOTE: adapted from levelup
  test('chained batch with per-operation encoding options', async function (t) {
    t.plan(2)

    const db = testCommon.factory()
    await db.open()

    const utf8 = db.keyEncoding('utf8')
    const json = db.valueEncoding('json')

    db.once('write', function (operations) {
      t.same(operations, [
        { type: 'put', key: 'a', value: 'a', keyEncoding: utf8, valueEncoding: json, encodedKey: utf8.encode('a'), encodedValue: utf8.encode('"a"') },
        { type: 'put', key: 'b', value: 'b', keyEncoding: utf8, valueEncoding: utf8, encodedKey: utf8.encode('b'), encodedValue: utf8.encode('b') },
        { type: 'put', key: '"c"', value: 'c', keyEncoding: utf8, valueEncoding: utf8, encodedKey: utf8.encode('"c"'), encodedValue: utf8.encode('c') },
        { type: 'del', key: 'c', keyEncoding: json, encodedKey: utf8.encode('"c"'), arbitraryOption: true }
      ])
    })

    await db.batch()
      .put('a', 'a', { valueEncoding: 'json' })
      .put('b', 'b')
      .put('"c"', 'c')
      .del('c', { keyEncoding: 'json', arbitraryOption: true })
      .write()

    t.same(await db.iterator().all(), [
      ['a', '"a"'],
      ['b', 'b']
    ])

    return db.close()
  })
}

exports.events = function (test, testCommon) {
  test('db.close() on chained batch write event', async function (t) {
    const db = testCommon.factory()
    await db.open()

    let promise

    db.on('write', function () {
      // Should not interfere with the current write() operation
      promise = db.close()
    })

    await db.batch().put('a', 'b').write()
    await promise

    t.ok(promise, 'event was emitted')
  })
}

exports.tearDown = function (test, testCommon) {
  test('chained batch teardown', async function (t) {
    return db.close()
  })
}

exports.dispose = function (test, testCommon) {
  // Can't use the syntax yet (https://github.com/tc39/proposal-explicit-resource-management)
  Symbol.asyncDispose && test('Symbol.asyncDispose', async function (t) {
    const db = testCommon.factory()
    await db.open()

    const batch = db.batch()
    await batch[Symbol.asyncDispose]()

    return db.close()
  })
}

exports.all = function (test, testCommon) {
  exports.setUp(test, testCommon)
  exports.args(test, testCommon)
  exports.batch(test, testCommon)
  exports.events(test, testCommon)
  exports.tearDown(test, testCommon)
  exports.dispose(test, testCommon)
}
