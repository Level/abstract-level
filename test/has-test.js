'use strict'

const { illegalKeys } = require('./util')
const traits = require('./traits')

let db

exports.setUp = function (test, testCommon) {
  test('has() setup', async function (t) {
    db = testCommon.factory()
    return db.open()
  })
}

exports.args = function (test, testCommon) {
  test('has() with illegal keys', function (t) {
    t.plan(illegalKeys.length * 2)

    for (const { name, key } of illegalKeys) {
      db.has(key).catch(function (err) {
        t.ok(err instanceof Error, name + ' - is Error')
        t.is(err.code, 'LEVEL_INVALID_KEY', name + ' - correct error code')
      })
    }
  })
}

exports.has = function (test, testCommon) {
  test('simple has()', async function (t) {
    await db.put('foo', 'bar')

    t.is(await db.has('foo'), true)
    t.is(await db.has('foo', {}), true) // same but with {}

    for (const key of ['non-existent', Math.random()]) {
      t.is(await db.has(key), false, 'not found')
    }
  })

  test('simultaneous has()', async function (t) {
    t.plan(20)

    await db.put('hello', 'world')
    const promises = []

    for (let i = 0; i < 10; ++i) {
      promises.push(db.has('hello').then((value) => {
        t.is(value, true, 'found')
      }))
    }

    for (let i = 0; i < 10; ++i) {
      promises.push(db.has('non-existent').then((value) => {
        t.is(value, false, 'not found')
      }))
    }

    return Promise.all(promises)
  })

  traits.open('has()', testCommon, async function (t, db) {
    t.is(await db.has('foo'), false)
  })

  traits.closed('has()', testCommon, async function (t, db) {
    return db.has('foo')
  })
}

exports.tearDown = function (test, testCommon) {
  test('has() teardown', async function (t) {
    return db.close()
  })
}

exports.all = function (test, testCommon) {
  exports.setUp(test, testCommon)
  exports.args(test, testCommon)
  exports.has(test, testCommon)
  exports.tearDown(test, testCommon)
}
