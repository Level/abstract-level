'use strict'

let db
let keySequence = 0

const testKey = () => 'test' + (++keySequence)

exports.all = function (test, testCommon) {
  test('decode error setup', async function (t) {
    db = testCommon.factory()
    return db.open()
  })

  // NOTE: adapted from encoding-down
  test('decode error is wrapped by get() and variants', async function (t) {
    t.plan(testCommon.supports.getSync ? 6 : 4)

    const key = testKey()
    const valueEncoding = {
      encode: (v) => v,
      decode: (v) => { throw new Error('decode error xyz') },
      format: 'utf8'
    }

    await db.put(key, 'bar', { valueEncoding })

    try {
      await db.get(key, { valueEncoding })
    } catch (err) {
      t.is(err.code, 'LEVEL_DECODE_ERROR')
      t.is(err.cause.message, 'decode error xyz')
    }

    try {
      await db.getMany(['other-key', key], { valueEncoding })
    } catch (err) {
      t.is(err.code, 'LEVEL_DECODE_ERROR')
      t.is(err.cause.message, 'decode error xyz')
    }

    if (testCommon.supports.getSync) {
      try {
        db.getSync(key, { valueEncoding })
      } catch (err) {
        t.is(err.code, 'LEVEL_DECODE_ERROR')
        t.is(err.cause.message, 'decode error xyz')
      }
    }
  })

  // NOTE: adapted from encoding-down
  test('get() and variants yield decode error if stored value is invalid', async function (t) {
    t.plan(testCommon.supports.getSync ? 6 : 4)

    const key = testKey()
    await db.put(key, 'this {} is [] not : json', { valueEncoding: 'utf8' })

    try {
      await db.get(key, { valueEncoding: 'json' })
    } catch (err) {
      t.is(err.code, 'LEVEL_DECODE_ERROR')
      t.is(err.cause.name, 'SyntaxError') // From JSON.parse()
    }

    try {
      await db.getMany(['other-key', key], { valueEncoding: 'json' })
    } catch (err) {
      t.is(err.code, 'LEVEL_DECODE_ERROR')
      t.is(err.cause.name, 'SyntaxError') // From JSON.parse()
    }

    if (testCommon.supports.getSync) {
      try {
        db.getSync(key, { valueEncoding: 'json' })
      } catch (err) {
        t.is(err.code, 'LEVEL_DECODE_ERROR')
        t.is(err.cause.name, 'SyntaxError') // From JSON.parse()
      }
    }
  })

  test('decode error teardown', async function (t) {
    return db.close()
  })
}
