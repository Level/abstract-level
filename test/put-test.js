'use strict'

const { illegalKeys, illegalValues, assertPromise } = require('./util')
const traits = require('./traits')

let db

exports.setUp = function (test, testCommon) {
  test('put() setup', async function (t) {
    db = testCommon.factory()
    return db.open()
  })
}

exports.args = function (test, testCommon) {
  test('put() with illegal keys', function (t) {
    t.plan(illegalKeys.length * 2)

    for (const { name, key } of illegalKeys) {
      db.put(key, 'value').catch(function (err) {
        t.ok(err instanceof Error, name + ' - is Error')
        t.is(err.code, 'LEVEL_INVALID_KEY', name + ' - correct error code')
      })
    }
  })

  test('put() with illegal values', function (t) {
    t.plan(illegalValues.length * 2)

    for (const { name, value } of illegalValues) {
      db.put('key', value).catch(function (err) {
        t.ok(err instanceof Error, name + ' - is Error')
        t.is(err.code, 'LEVEL_INVALID_VALUE', name + ' - correct error code')
      })
    }
  })
}

exports.put = function (test, testCommon) {
  test('simple put()', async function (t) {
    t.is(await assertPromise(db.put('foo', 'bar')), undefined, 'void promise')
    t.is(await db.get('foo'), 'bar')
    await db.put('foo', 'new')
    t.is(await db.get('foo'), 'new', 'value was overwritten')
    await db.put('bar', 'foo', {}) // same but with {}
    t.is(await db.get('bar'), 'foo')
  })

  traits.open('put()', testCommon, async function (t, db) {
    t.is(await assertPromise(db.put('foo', 'bar')), undefined, 'void promise')
    t.is(await db.get('foo'), 'bar', 'value is ok')
  })

  traits.closed('put()', testCommon, async function (t, db) {
    return db.put('foo', 'bar')
  })
}

exports.tearDown = function (test, testCommon) {
  test('put() teardown', async function (t) {
    return db.close()
  })
}

exports.all = function (test, testCommon) {
  exports.setUp(test, testCommon)
  exports.args(test, testCommon)
  exports.put(test, testCommon)
  exports.tearDown(test, testCommon)
}
