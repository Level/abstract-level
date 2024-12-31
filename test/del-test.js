'use strict'

const { illegalKeys, assertPromise } = require('./util')
const traits = require('./traits')

let db

exports.setUp = function (test, testCommon) {
  test('del() setup', async function (t) {
    db = testCommon.factory()
    return db.open()
  })
}

exports.args = function (test, testCommon) {
  test('del() with illegal keys', function (t) {
    t.plan(illegalKeys.length * 2)

    for (const { name, key } of illegalKeys) {
      db.del(key).catch(function (err) {
        t.ok(err instanceof Error, name + ' - is Error')
        t.is(err.code, 'LEVEL_INVALID_KEY', name + ' - correct error code')
      })
    }
  })
}

exports.del = function (test, testCommon) {
  test('simple del()', async function (t) {
    await db.put('foo', 'bar')
    t.is(await db.get('foo'), 'bar')
    t.is(await assertPromise(db.del('foo')), undefined, 'void promise')
    t.is(await db.get('foo'), undefined, 'not found')
  })

  test('del() on non-existent key', async function (t) {
    for (const key of ['nope', Math.random()]) {
      t.is(await assertPromise(db.del(key)), undefined, 'void promise')
    }
  })

  traits.open('del()', testCommon, async function (t, db) {
    let emitted = false
    db.once('write', () => { emitted = true })
    t.is(await db.del('foo'), undefined, 'void promise')
    t.ok(emitted) // Not sure what the purpose of this test is
  })

  traits.closed('del()', testCommon, async function (t, db) {
    return db.del('foo')
  })
}

exports.tearDown = function (test, testCommon) {
  test('del() teardown', async function (t) {
    return db.close()
  })
}

exports.all = function (test, testCommon) {
  exports.setUp(test, testCommon)
  exports.args(test, testCommon)
  exports.del(test, testCommon)
  exports.tearDown(test, testCommon)
}
