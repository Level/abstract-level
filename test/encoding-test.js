'use strict'

let db
let keySequence = 0

const testKey = () => 'test' + (++keySequence)

// TODO: test encoding options on every method. This is largely
// covered (indirectly) by other tests, but a dedicated property-
// based test for each would be good to have.
exports.all = function (test, testCommon) {
  test('encoding setup', async function (t) {
    db = testCommon.factory()
    return db.open()
  })

  // NOTE: adapted from encoding-down
  test('encodings default to utf8', function (t) {
    t.is(db.keyEncoding().commonName, 'utf8')
    t.is(db.valueEncoding().commonName, 'utf8')
    t.end()
  })

  test('can set encoding options in factory', async function (t) {
    const dbs = []

    for (const name of ['buffer', 'view', 'json']) {
      if (!testCommon.supports.encodings[name]) continue

      const db1 = testCommon.factory({ keyEncoding: name })
      const db2 = testCommon.factory({ valueEncoding: name })
      const db3 = testCommon.factory({ keyEncoding: name, valueEncoding: name })

      t.is(db1.keyEncoding().commonName, name)
      t.is(db1.keyEncoding(), db1.keyEncoding(name))
      t.is(db1.valueEncoding().commonName, 'utf8')
      t.is(db1.valueEncoding(), db1.valueEncoding('utf8'))

      t.is(db2.keyEncoding().commonName, 'utf8')
      t.is(db2.keyEncoding(), db2.keyEncoding('utf8'))
      t.is(db2.valueEncoding().commonName, name)
      t.is(db2.valueEncoding(), db2.valueEncoding(name))

      t.is(db3.keyEncoding().commonName, name)
      t.is(db3.keyEncoding(), db3.keyEncoding(name))
      t.is(db3.valueEncoding().commonName, name)
      t.is(db3.valueEncoding(), db3.valueEncoding(name))

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
      testCommon.supports.getSync && t.is(db.getSync(1), '2')
      return db.close()
    })
  }

  // NOTE: adapted from encoding-down
  test('can decode from string to json', async function (t) {
    const key = testKey()
    const data = { thisis: 'json' }
    await db.put(key, JSON.stringify(data), { valueEncoding: 'utf8' })

    t.same(await db.get(key, { valueEncoding: 'json' }), data, 'got parsed object')

    if (testCommon.supports.getSync) {
      t.same(db.getSync(key, { valueEncoding: 'json' }), data, 'got parsed object (sync)')
    }
  })

  // NOTE: adapted from encoding-down
  test('can decode from json to string', async function (t) {
    const data = { thisis: 'json' }
    const key = testKey()
    await db.put(key, data, { valueEncoding: 'json' })

    t.same(await db.get(key, { valueEncoding: 'utf8' }), JSON.stringify(data), 'got unparsed JSON string')

    if (testCommon.supports.getSync) {
      t.same(db.getSync(key, { valueEncoding: 'utf8' }), JSON.stringify(data), 'got unparsed JSON string (sync)')
    }
  })

  // NOTE: adapted from encoding-down
  test('getMany() skips decoding not-found values', async function (t) {
    t.plan(2)

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

    await db.put(key, data, { valueEncoding })
    t.same(await db.getMany([key, testKey()], { valueEncoding }), [data, undefined])
  })

  // NOTE: adapted from memdown
  test('number keys with utf8 encoding', async function (t) {
    const db = testCommon.factory()
    const numbers = [-Infinity, 0, 12, 2, +Infinity]

    await db.open()
    await db.batch(numbers.map(key => ({ type: 'put', key, value: 'value' })))

    const keys = await db.keys({ keyEncoding: 'utf8' }).all()
    t.same(keys, numbers.map(String), 'sorts lexicographically')

    return db.close()
  })

  test('encoding teardown', async function (t) {
    return db.close()
  })
}
