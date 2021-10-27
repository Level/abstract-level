'use strict'

const { concat } = require('./util')

let db
let keySequence = 0

const testKey = () => 'test' + (++keySequence)

exports.all = function (test, testCommon) {
  test('setup', async function (t) {
    db = testCommon.factory()
    return db.open()
  })

  // NOTE: adapted from encoding-down
  test('encodings default to utf8', function (t) {
    const expected = ['utf8', 'utf8+buffer', 'utf8+view']
    t.ok(expected.includes(db.keyEncoding().type))
    t.ok(expected.includes(db.valueEncoding().type))
    t.end()
  })

  test('can set encoding options in factory', async function (t) {
    const norm = (type) => type.split('+')[0]
    const dbs = []

    for (const enc of ['buffer', 'view', 'json']) {
      if (!testCommon.supports.encodings[enc]) continue

      const db1 = testCommon.factory({ keyEncoding: enc })
      const db2 = testCommon.factory({ valueEncoding: enc })
      const db3 = testCommon.factory({ keyEncoding: enc, valueEncoding: enc })

      t.is(norm(db1.keyEncoding().type), enc)
      t.is(db1.keyEncoding(), db1.keyEncoding(enc))
      t.is(norm(db1.valueEncoding().type), 'utf8')
      t.is(db1.valueEncoding(), db1.valueEncoding('utf8'))

      t.is(norm(db2.keyEncoding().type), 'utf8')
      t.is(db2.keyEncoding(), db2.keyEncoding('utf8'))
      t.is(norm(db2.valueEncoding().type), enc)
      t.is(db2.valueEncoding(), db2.valueEncoding(enc))

      t.is(norm(db3.keyEncoding().type), enc)
      t.is(db3.keyEncoding(), db3.keyEncoding(enc))
      t.is(norm(db3.valueEncoding().type), enc)
      t.is(db3.valueEncoding(), db3.valueEncoding(enc))

      dbs.push(db1, db2, db3)
    }

    await Promise.all(dbs.map(db => db.close()))
  })

  // NOTE: adapted from encoding-down
  for (const deferred of [false, true]) {
    test(`default utf8 encoding stringifies numbers (deferred: ${deferred})`, async function (t) {
      const db = testCommon.factory()
      if (!deferred) await db.open()
      await db.put(1, 2)
      t.is(await db.get(1), '2')
      return db.close()
    })
  }

  // NOTE: adapted from encoding-down
  test('can decode from string to json', function (t) {
    const key = testKey()
    const data = { thisis: 'json' }

    db.put(key, JSON.stringify(data), { valueEncoding: 'utf8' }, function (err) {
      t.ifError(err, 'no put() error')

      db.get(key, { valueEncoding: 'json' }, function (err, value) {
        t.ifError(err, 'no get() error')
        t.same(value, data, 'got parsed object')
        t.end()
      })
    })
  })

  // NOTE: adapted from encoding-down
  test('can decode from json to string', function (t) {
    const data = { thisis: 'json' }
    const key = testKey()

    db.put(key, data, { valueEncoding: 'json' }, function (err) {
      t.ifError(err, 'no put() error')

      db.get(key, { valueEncoding: 'utf8' }, function (err, value) {
        t.ifError(err, 'no get() error')
        t.is(value, JSON.stringify(data), 'got unparsed JSON string')
        t.end()
      })
    })
  })

  // NOTE: adapted from encoding-down
  test('getMany() skips decoding not-found values', function (t) {
    t.plan(4)

    const valueEncoding = {
      encode: JSON.stringify,
      decode (value) {
        t.is(value, JSON.stringify(data))
        return JSON.parse(value)
      },
      format: 'utf8'
    }

    const data = { beep: 'boop' }
    const key = testKey()

    db.put(key, data, { valueEncoding }, function (err) {
      t.ifError(err, 'no put() error')

      db.getMany([key, testKey()], { valueEncoding }, function (err, values) {
        t.ifError(err, 'no getMany() error')
        t.same(values, [data, undefined])
      })
    })
  })

  // NOTE: adapted from memdown
  test('number keys with utf8 encoding', async function (t) {
    const db = testCommon.factory()
    const numbers = [-Infinity, 0, 12, 2, +Infinity]

    await db.open()
    await db.batch(numbers.map(key => ({ type: 'put', key, value: 'value' })))

    const entries = await concat(db.iterator({ keyEncoding: 'utf8' }))
    const keys = entries.map(e => e.key)

    t.same(keys, numbers.map(String), 'sorts lexicographically')

    return db.close()
  })

  // NOTE: copied from encoding-down
  // TODO: move to ...?
  // test.skip('encodes start and end of approximateSize()', function (t) {
  //   const db = encdown({
  //     approximateSize: function (start, end) {
  //       t.is(start, '1')
  //       t.is(end, '2')
  //       t.end()
  //     }
  //   })
  //
  //   db.approximateSize(1, 2, noop)
  // })

  // NOTE: copied from encoding-down
  // TODO: move to ...?
  // test.skip('encodes start and end of compactRange()', function (t) {
  //   const db = encdown({
  //     compactRange: function (start, end) {
  //       t.is(start, '1')
  //       t.is(end, '2')
  //       t.end()
  //     }
  //   })
  //
  //   db.compactRange(1, 2, noop)
  // })

  // NOTE: copied from encoding-down
  // TODO: move to ...?
  // test.skip('encodes start and end of approximateSize() with custom encoding', function (t) {
  //   const db = encdown({
  //     approximateSize: function (start, end) {
  //       t.is(start, '"a"')
  //       t.is(end, '"b"')
  //       t.end()
  //     }
  //   })
  //
  //   db.approximateSize('a', 'b', { keyEncoding: 'json' }, noop)
  // })

  // NOTE: copied from encoding-down
  // TODO: move to ...?
  // test.skip('encodes start and end of compactRange() with custom encoding', function (t) {
  //   const db = encdown({
  //     compactRange: function (start, end) {
  //       t.is(start, '"a"')
  //       t.is(end, '"b"')
  //       t.end()
  //     }
  //   })
  //
  //   db.compactRange('a', 'b', { keyEncoding: 'json' }, noop)
  // })

  test('teardown', async function (t) {
    return db.close()
  })
}
