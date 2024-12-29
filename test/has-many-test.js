'use strict'

const { illegalKeys } = require('./util')
const traits = require('./traits')

let db

/**
 * @param {import('tape')} test
 */
exports.setUp = function (test, testCommon) {
  test('hasMany() setup', async function (t) {
    db = testCommon.factory()
    return db.open()
  })
}

/**
 * @param {import('tape')} test
 */
exports.args = function (test, testCommon) {
  test('hasMany() requires an array argument', function (t) {
    t.plan(6)

    db.hasMany().catch(function (err) {
      t.is(err && err.name, 'TypeError')
      t.is(err && err.message, "The first argument 'keys' must be an array")
    })

    db.hasMany('foo').catch(function (err) {
      t.is(err && err.name, 'TypeError')
      t.is(err && err.message, "The first argument 'keys' must be an array")
    })

    db.hasMany('foo', {}).catch(function (err) {
      t.is(err && err.name, 'TypeError')
      t.is(err && err.message, "The first argument 'keys' must be an array")
    })
  })

  test('hasMany() with illegal keys', function (t) {
    t.plan(illegalKeys.length * 4)

    for (const { name, key } of illegalKeys) {
      db.hasMany([key]).catch(function (err) {
        t.ok(err instanceof Error, name + ' - is Error')
        t.is(err.code, 'LEVEL_INVALID_KEY', name + ' - correct error code')
      })

      db.hasMany(['valid', key]).catch(function (err) {
        t.ok(err instanceof Error, name + ' - is Error (second key)')
        t.is(err.code, 'LEVEL_INVALID_KEY', name + ' - correct error code (second key)')
      })
    }
  })
}

/**
 * @param {import('tape')} test
 */
exports.hasMany = function (test, testCommon) {
  test('simple hasMany()', async function (t) {
    await db.put('foo', 'bar')

    t.same(await db.hasMany(['foo']), [true])
    t.same(await db.hasMany(['foo'], {}), [true]) // same but with {}
    t.same(await db.hasMany(['beep']), [false])

    await db.put('beep', 'boop')

    t.same(await db.hasMany(['beep']), [true])
    t.same(await db.hasMany(['foo', 'beep']), [true, true])
    t.same(await db.hasMany(['aaa', 'beep']), [false, true])
    t.same(await db.hasMany(['beep', 'aaa']), [true, false], 'maintains order of input keys')
  })

  test('empty hasMany()', async function (t) {
    t.same(await db.hasMany([]), [])

    const encodings = Object.keys(db.supports.encodings)
      .filter(k => db.supports.encodings[k])

    for (const valueEncoding of encodings) {
      t.same(await db.hasMany([], { valueEncoding }), [])
    }
  })

  test('simultaneous hasMany()', async function (t) {
    t.plan(20)

    await db.put('hello', 'world')
    const promises = []

    for (let i = 0; i < 10; ++i) {
      promises.push(db.hasMany(['hello']).then(function (values) {
        t.same(values, [true])
      }))
    }

    for (let i = 0; i < 10; ++i) {
      promises.push(db.hasMany(['non-existent']).then(function (values) {
        t.same(values, [false])
      }))
    }

    return Promise.all(promises)
  })

  traits.open('hasMany()', testCommon, async function (t, db) {
    t.same(await db.hasMany(['foo']), [false])
  })

  traits.closed('hasMany()', testCommon, async function (t, db) {
    return db.hasMany(['foo'])
  })

  // Also test empty array because it has a fast-path
  traits.open('hasMany() with empty array', testCommon, async function (t, db) {
    t.same(await db.hasMany([]), [])
  })

  traits.closed('hasMany() with empty array', testCommon, async function (t, db) {
    return db.hasMany([])
  })
}

/**
 * @param {import('tape')} test
 */
exports.tearDown = function (test, testCommon) {
  test('hasMany() teardown', async function (t) {
    return db.close()
  })
}

/**
 * @param {import('tape')} test
 */
exports.all = function (test, testCommon) {
  exports.setUp(test, testCommon)
  exports.args(test, testCommon)
  exports.hasMany(test, testCommon)
  exports.tearDown(test, testCommon)
}
