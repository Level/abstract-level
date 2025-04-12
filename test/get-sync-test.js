'use strict'

const { illegalKeys } = require('./util')
const traits = require('./traits')

let db

exports.setUp = function (test, testCommon) {
  test('getSync() setup', async function (t) {
    db = testCommon.factory()
    return db.open()
  })
}

exports.args = function (test, testCommon) {
  test('getSync() with illegal keys', function (t) {
    t.plan(illegalKeys.length * 2)

    for (const { name, key } of illegalKeys) {
      try {
        db.getSync(key)
      } catch (err) {
        t.ok(err instanceof Error, name + ' - is Error')
        t.is(err.code, 'LEVEL_INVALID_KEY', name + ' - correct error code')
      }
    }
  })
}

exports.getSync = function (test, testCommon) {
  test('simple getSync()', async function (t) {
    await db.put('foo', 'bar')

    t.is(db.getSync('foo'), 'bar')
    t.is(db.getSync('foo', {}), 'bar') // same but with {}
    t.is(db.getSync('foo', { valueEncoding: 'utf8' }), 'bar')
  })

  test('getSync() on non-existent key', async function (t) {
    for (const key of ['non-existent', Math.random()]) {
      t.is(db.getSync(key), undefined, 'not found')
    }
  })

  traits.closed('getSync()', testCommon, async function (t, db) {
    db.getSync('foo')
  })
}

exports.tearDown = function (test, testCommon) {
  test('getSync() teardown', async function (t) {
    return db.close()
  })
}

exports.all = function (test, testCommon) {
  exports.setUp(test, testCommon)
  exports.args(test, testCommon)
  exports.getSync(test, testCommon)
  exports.tearDown(test, testCommon)
}
