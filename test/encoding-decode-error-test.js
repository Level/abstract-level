'use strict'

let db
let keySequence = 0

const testKey = () => 'test' + (++keySequence)

exports.all = function (test, testCommon) {
  test('setup', async function (t) {
    db = testCommon.factory()
    return db.open()
  })

  // NOTE: adapted from encoding-down
  test('get() and getMany() forward decode error', function (t) {
    const key = testKey()
    const valueEncoding = {
      encode: (v) => v,
      decode: (v) => { throw new Error('decode error xyz') },
      format: 'utf8'
    }

    db.put(key, 'bar', { valueEncoding }, function (err) {
      t.ifError(err, 'no put() error')

      db.get(key, { valueEncoding }, function (err, value) {
        t.is(err && err.code, 'LEVEL_DECODE_ERROR')
        t.is(err && err.cause && err.cause.message, 'decode error xyz')
        t.is(value, undefined)

        db.getMany(['other-key', key], { valueEncoding }, function (err, values) {
          t.is(err && err.code, 'LEVEL_DECODE_ERROR')
          t.is(err && err.cause && err.cause.message, 'decode error xyz')
          t.is(values, undefined)
          t.end()
        })
      })
    })
  })

  // NOTE: adapted from encoding-down
  test('get() and getMany() yield encoding error if stored value is invalid', function (t) {
    const key = testKey()

    db.put(key, 'this {} is [] not : json', { valueEncoding: 'utf8' }, function (err) {
      t.ifError(err, 'no put() error')

      db.get(key, { valueEncoding: 'json' }, function (err) {
        t.is(err && err.code, 'LEVEL_DECODE_ERROR')
        t.is(err && err.cause.name, 'SyntaxError') // From JSON.parse()

        db.getMany(['other-key', key], { valueEncoding: 'json' }, function (err) {
          t.is(err && err.code, 'LEVEL_DECODE_ERROR')
          t.is(err && err.cause.name, 'SyntaxError') // From JSON.parse()
          t.end()
        })
      })
    })
  })

  for (const deferred of [false, true]) {
    // NOTE: adapted from encoding-down
    test(`iterator() catches decoding error from keyEncoding (deferred: ${deferred})`, async function (t) {
      t.plan(4)

      const keyEncoding = {
        format: 'utf8',
        decode: function (key) {
          t.is(key, 'abc')
          throw new Error('from encoding')
        }
      }

      const db = testCommon.factory()
      await db.put('abc', 'value')

      if (deferred) {
        await db.close()
        db.open(t.ifError.bind(t))
      } else {
        t.pass('non-deferred')
      }

      const it = db.iterator({ keyEncoding })

      try {
        await it.next()
      } catch (err) {
        t.is(err.code, 'LEVEL_DECODE_ERROR')
        t.is(err.cause && err.cause.message, 'from encoding')
      }

      return db.close()
    })

    // NOTE: adapted from encoding-down
    test(`iterator() catches decoding error from valueEncoding (deferred: ${deferred})`, async function (t) {
      t.plan(4)

      const valueEncoding = {
        format: 'utf8',
        decode (value) {
          t.is(value, 'abc')
          throw new Error('from encoding')
        }
      }

      const db = testCommon.factory()
      await db.put('key', 'abc')

      if (deferred) {
        await db.close()
        db.open(t.ifError.bind(t))
      } else {
        t.pass('non-deferred')
      }

      const it = db.iterator({ valueEncoding })

      try {
        await it.next()
      } catch (err) {
        t.is(err.code, 'LEVEL_DECODE_ERROR')
        t.is(err.cause && err.cause.message, 'from encoding')
      }

      return db.close()
    })
  }

  test('teardown', async function (t) {
    return db.close()
  })
}
