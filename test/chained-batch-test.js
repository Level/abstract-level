'use strict'

const { concat } = require('./util')

let db

exports.setUp = function (test, testCommon) {
  test('setUp db', function (t) {
    db = testCommon.factory()
    db.open(t.end.bind(t))
  })
}

exports.args = function (test, testCommon) {
  test('test batch has db reference', function (t) {
    t.ok(db.batch().db === db)
    t.end()
  })

  test('test batch#put() with missing, null or undefined `value`', function (t) {
    t.plan(3 * 2)

    for (const args of [[null], [undefined], []]) {
      const batch = db.batch()

      try {
        batch.put('key', ...args)
      } catch (err) {
        t.is(err.message, 'value cannot be `null` or `undefined`', 'correct error message')
        t.is(batch.length, 0, 'length is not incremented on error')
      }
    }
  })

  test('test batch#put() with null or undefined `key`', function (t) {
    t.plan(2 * 2)

    for (const key of [null, undefined]) {
      const batch = db.batch()

      try {
        batch.put(key, 'foo1')
      } catch (err) {
        t.equal(err.message, 'key cannot be `null` or `undefined`', 'correct error message')
        t.is(batch.length, 0, 'length is not incremented on error')
      }
    }
  })

  test('test batch#put() with missing `key` and `value`', function (t) {
    t.plan(2)

    const batch = db.batch()

    try {
      batch.put()
    } catch (err) {
      t.equal(err.message, 'key cannot be `null` or `undefined`', 'correct error message')
      t.is(batch.length, 0, 'length is not incremented on error')
    }
  })

  test('test batch#del() with missing, null or undefined `key`', function (t) {
    t.plan(3 * 2)

    for (const args of [[null], [undefined], []]) {
      const batch = db.batch()

      try {
        batch.del(...args)
      } catch (err) {
        t.equal(err.message, 'key cannot be `null` or `undefined`', 'correct error message')
        t.is(batch.length, 0, 'length is not incremented on error')
      }
    }
  })

  test('test batch#clear() doesn\'t throw', function (t) {
    db.batch().clear()
    t.end()
  })

  test('test batch#put() after write()', function (t) {
    const batch = db.batch().put('foo', 'bar')
    batch.write(function () {})
    try {
      batch.put('boom', 'bang')
    } catch (err) {
      t.equal(err.message, 'Batch is not open', 'correct error message')
      return t.end()
    }
    t.fail('should have thrown')
    t.end()
  })

  test('test batch#del() after write()', function (t) {
    const batch = db.batch().put('foo', 'bar')
    batch.write(function () {})
    try {
      batch.del('foo')
    } catch (err) {
      t.equal(err.message, 'Batch is not open', 'correct error message')
      return t.end()
    }
    t.fail('should have thrown')
    t.end()
  })

  test('test batch#clear() after write()', function (t) {
    const batch = db.batch().put('foo', 'bar')
    batch.write(function () {})
    try {
      batch.clear()
    } catch (err) {
      t.equal(err.message, 'Batch is not open', 'correct error message')
      return t.end()
    }
    t.fail('should have thrown')
    t.end()
  })

  test('test batch#write() after write()', function (t) {
    t.plan(1)
    const batch = db.batch().put('foo', 'bar')
    batch.write(function () {})
    batch.write(function (err) {
      t.is(err && err.message, 'Batch is not open', 'correct error message')
    })
  })

  test('test batch#write() with no operations', function (t) {
    let async = false

    db.batch().write(function (err) {
      t.ifError(err, 'no error from write()')
      t.ok(async, 'callback is asynchronous')
      t.end()
    })

    async = true
  })

  test('test batch#write() with promise and no operations', function (t) {
    db.batch().write()
      .then(t.end.bind(t))
      .catch(t.end.bind(t))
  })

  test('test twice batch#close() is idempotent', function (t) {
    const batch = db.batch()
    batch.close(function () {
      let async = false

      batch.close(function () {
        t.ok(async, 'callback is asynchronous')
        t.end()
      })

      async = true
    })
  })
}

exports.batch = function (test, testCommon) {
  test('test basic batch', function (t) {
    db.batch([
      { type: 'put', key: 'one', value: '1' },
      { type: 'put', key: 'two', value: '2' },
      { type: 'put', key: 'three', value: '3' }
    ], function (err) {
      t.error(err)

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

      batch.write(function (err) {
        t.error(err, 'no write() error')

        concat(
          db.iterator({ keyEncoding: 'utf8', valueEncoding: 'utf8' }), function (err, data) {
            t.error(err)
            t.equal(data.length, 3, 'correct number of entries')
            const expected = [
              { key: 'foo', value: 'bar' },
              { key: 'one', value: 'I' },
              { key: 'two', value: 'II' }
            ]
            t.deepEqual(data, expected)
            t.end()
          }
        )
      })
    })
  })

  test('test basic batch with promise', function (t) {
    const db = testCommon.factory()

    db.open(function (err) {
      t.error(err)

      db.batch()
        .put('1', 'one')
        .put('2', 'two')
        .put('3', 'three')
        .write().then(function () {
          concat(
            db.iterator({ keyEncoding: 'utf8', valueEncoding: 'utf8' }), function (err, data) {
              t.error(err)
              t.same(data, [
                { key: '1', value: 'one' },
                { key: '2', value: 'two' },
                { key: '3', value: 'three' }
              ])
              db.close(t.end.bind(t))
            }
          )
        }).catch(t.fail.bind(t))
    })
  })

  // NOTE: adapted from levelup
  test('chained batch with per-operation encoding options', async function (t) {
    t.plan(2)

    const db = testCommon.factory()
    await db.open()

    db.once('batch', function (operations) {
      t.same(operations, [
        { type: 'put', key: 'a', value: 'a', valueEncoding: 'json' },
        { type: 'put', key: 'b', value: 'b' },
        { type: 'put', key: '"c"', value: 'c' },
        { type: 'del', key: 'c', keyEncoding: 'json', arbitraryOption: true }
      ])
    })

    await db.batch()
      .put('a', 'a', { valueEncoding: 'json' })
      .put('b', 'b')
      .put('"c"', 'c')
      .del('c', { keyEncoding: 'json', arbitraryOption: true })
      .write()

    t.same(await concat(db.iterator()), [
      { key: 'a', value: '"a"' },
      { key: 'b', value: 'b' }
    ])

    return db.close()
  })
}

exports.events = function (test, testCommon) {
  test('test chained batch() emits batch event', async function (t) {
    t.plan(2)

    const db = testCommon.factory()
    await db.open()

    t.ok(db.supports.events.batch)

    db.on('batch', function (ops) {
      t.same(ops, [
        { type: 'put', key: 987, value: 'b', custom: 123 },
        { type: 'del', key: 216, custom: 999 }
      ])
    })

    await db.batch().put(987, 'b', { custom: 123 }).del(216, { custom: 999 }).write()
    await db.close()
  })

  test('test close() on chained batch event', async function () {
    const db = testCommon.factory()
    await db.open()

    let promise

    db.on('batch', function () {
      // Should not interfere with the current write() operation
      promise = db.close()
    })

    await db.batch().put('a', 'b').write()
    await promise
  })
}

exports.tearDown = function (test, testCommon) {
  test('tearDown', function (t) {
    db.close(t.end.bind(t))
  })
}

exports.all = function (test, testCommon) {
  exports.setUp(test, testCommon)
  exports.args(test, testCommon)
  exports.batch(test, testCommon)
  exports.events(test, testCommon)
  exports.tearDown(test, testCommon)
}
