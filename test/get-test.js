'use strict'

const { illegalKeys, assertPromise } = require('./util')
const traits = require('./traits')

let db

exports.setUp = function (test, testCommon) {
  test('get() setup', async function (t) {
    db = testCommon.factory()
    return db.open()
  })
}

exports.args = function (test, testCommon) {
  test('get() with illegal keys', function (t) {
    t.plan(illegalKeys.length * 2)

    for (const { name, key } of illegalKeys) {
      db.get(key).catch(function (err) {
        t.ok(err instanceof Error, name + ' - is Error')
        t.is(err.code, 'LEVEL_INVALID_KEY', name + ' - correct error code')
      })
    }
  })
}

exports.get = function (test, testCommon) {
  test('simple get()', async function (t) {
    await db.put('foo', 'bar')
    t.is(await assertPromise(db.get('foo')), 'bar')
    t.is(await db.get('foo', {}), 'bar') // same but with {}
    t.is(await db.get('foo', { valueEncoding: 'utf8' }), 'bar')
  })

  test('get() on non-existent key', async function (t) {
    for (const key of ['non-existent', Math.random()]) {
      t.is(await assertPromise(db.get(key)), undefined, 'not found')
    }
  })

  test('simultaneous get()', async function (t) {
    t.plan(20)

    await db.put('hello', 'world')
    const promises = []

    for (let i = 0; i < 10; ++i) {
      promises.push(db.get('hello').then((value) => {
        t.is(value, 'world')
      }))
    }

    for (let i = 0; i < 10; ++i) {
      promises.push(db.get('non-existent').then((value) => {
        t.is(value, undefined, 'not found')
      }))
    }

    return Promise.all(promises)
  })

  traits.open('get()', testCommon, async function (t, db) {
    t.is(await assertPromise(db.get('foo')), undefined, 'void promise')
  })

  traits.closed('get()', testCommon, async function (t, db) {
    return db.get('foo')
  })
}

exports.tearDown = function (test, testCommon) {
  test('get() teardown', async function (t) {
    return db.close()
  })
}

exports.all = function (test, testCommon) {
  exports.setUp(test, testCommon)
  exports.args(test, testCommon)
  exports.get(test, testCommon)
  exports.tearDown(test, testCommon)
}
