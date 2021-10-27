'use strict'

const { concat } = require('./util')
const { Buffer } = require('buffer')

let db

exports.setUp = function (test, testCommon) {
  test('setUp db', function (t) {
    db = testCommon.factory()
    db.open(t.end.bind(t))
  })
}

exports.args = function (test, testCommon) {
  test('test iterator has db reference', function (t) {
    const iterator = db.iterator()
    // For levelup & deferred-leveldown compat: may return iterator of an underlying db, that's okay.
    t.ok(iterator.db === db || iterator.db === (db.db || db._db || db))
    iterator.close(t.end.bind(t))
  })
}

exports.sequence = function (test, testCommon) {
  test('test twice iterator#close() is idempotent', function (t) {
    const iterator = db.iterator()
    iterator.close(function () {
      let async = false

      iterator.close(function () {
        t.ok(async, 'callback is asynchronous')
        t.end()
      })

      async = true
    })
  })

  test('test iterator#next after iterator#close() callback with error', function (t) {
    const iterator = db.iterator()
    iterator.close(function (err) {
      t.error(err)

      let async = false

      iterator.next(function (err2) {
        t.ok(err2, 'returned error')
        t.is(err2.name, 'Error', 'correct error')
        t.is(err2.message, 'Iterator is not open', 'correct message')
        t.ok(async, 'callback is asynchronous')
        t.end()
      })

      async = true
    })
  })

  test('test twice iterator#next() throws', function (t) {
    const iterator = db.iterator()
    iterator.next(function (err) {
      t.error(err)
      iterator.close(function (err) {
        t.error(err)
        t.end()
      })
    })

    let async = false

    iterator.next(function (err) {
      t.ok(err, 'returned error')
      t.is(err.name, 'Error', 'correct error')
      t.is(err.message, 'Iterator is busy')
      t.ok(async, 'callback is asynchronous')
    })

    async = true
  })
}

exports.iterator = function (test, testCommon) {
  test('test simple iterator()', function (t) {
    const data = [
      { type: 'put', key: 'foobatch1', value: 'bar1' },
      { type: 'put', key: 'foobatch2', value: 'bar2' },
      { type: 'put', key: 'foobatch3', value: 'bar3' }
    ]
    let idx = 0

    db.batch(data, function (err) {
      t.error(err)
      const iterator = db.iterator()
      const fn = function (err, key, value) {
        t.error(err)
        if (key && value) {
          t.is(key, data[idx].key, 'correct key')
          t.is(value, data[idx].value, 'correct value')
          db.nextTick(next)
          idx++
        } else { // end
          t.ok(err == null, 'err argument is nullish')
          t.ok(typeof key === 'undefined', 'key argument is undefined')
          t.ok(typeof value === 'undefined', 'value argument is undefined')
          t.is(idx, data.length, 'correct number of entries')
          iterator.close(function () {
            t.end()
          })
        }
      }
      const next = function () {
        iterator.next(fn)
      }

      next()
    })
  })

  // NOTE: adapted from memdown
  test('iterator() sorts lexicographically', async function (t) {
    const db = testCommon.factory()
    await db.open()

    // Write in unsorted order with multiple operations
    await db.put('f', 'F')
    await db.put('a', 'A')
    await db.put('~', '~')
    await db.put('e', 'E')
    await db.put('🐄', '🐄')
    await db.batch([
      { type: 'put', key: 'd', value: 'D' },
      { type: 'put', key: 'b', value: 'B' },
      { type: 'put', key: 'ff', value: 'FF' },
      { type: 'put', key: 'a🐄', value: 'A🐄' }
    ])
    await db.batch([
      { type: 'put', key: '', value: 'empty' },
      { type: 'put', key: '2', value: '2' },
      { type: 'put', key: '12', value: '12' },
      { type: 'put', key: '\t', value: '\t' }
    ])

    t.same(await concat(db.iterator()), [
      { key: '', value: 'empty' },
      { key: '\t', value: '\t' },
      { key: '12', value: '12' },
      { key: '2', value: '2' },
      { key: 'a', value: 'A' },
      { key: 'a🐄', value: 'A🐄' },
      { key: 'b', value: 'B' },
      { key: 'd', value: 'D' },
      { key: 'e', value: 'E' },
      { key: 'f', value: 'F' },
      { key: 'ff', value: 'FF' },
      { key: '~', value: '~' },
      { key: '🐄', value: '🐄' }
    ])

    return db.close()
  })

  for (const keyEncoding of ['buffer', 'view']) {
    if (!testCommon.supports.encodings[keyEncoding]) continue

    test(`test iterator() has byte order (${keyEncoding} encoding)`, function (t) {
      const db = testCommon.factory({ keyEncoding })

      db.open(function (err) {
        t.ifError(err, 'no open() error')

        const ctor = keyEncoding === 'buffer' ? Buffer : Uint8Array
        const keys = [2, 11, 1].map(b => ctor.from([b]))

        db.batch(keys.map((key) => ({ type: 'put', key, value: 'x' })), function (err) {
          t.ifError(err, 'no batch() error')

          concat(db.iterator(), function (err, entries) {
            t.ifError(err, 'no concat() error')
            t.same(entries.map(e => e.key[0]), [1, 2, 11], 'order is ok')

            db.close(t.end.bind(t))
          })
        })
      })
    })

    // NOTE: adapted from memdown
    test(`test iterator() with byte range (${keyEncoding} encoding)`, function (t) {
      const db = testCommon.factory({ keyEncoding })

      db.open(function (err) {
        t.ifError(err, 'no open() error')

        db.put(Buffer.from('a0', 'hex'), 'A', function (err) {
          t.ifError(err, 'no put() error')

          const it = db.iterator({ lt: Buffer.from('ff', 'hex') })

          it.next(function (err, key, value) {
            t.ifError(err, 'no next() error')
            t.is(key && key.toString('hex'), 'a0')
            t.is(value, 'A')

            it.close(function (err) {
              t.ifError(err, 'no close() error')
              db.close(t.end.bind(t))
            })
          })
        })
      })
    })
  }
}

exports.tearDown = function (test, testCommon) {
  test('tearDown', function (t) {
    db.close(t.end.bind(t))
  })
}

exports.all = function (test, testCommon) {
  exports.setUp(test, testCommon)
  exports.args(test, testCommon)
  exports.sequence(test, testCommon)
  exports.iterator(test, testCommon)
  exports.tearDown(test, testCommon)
}
