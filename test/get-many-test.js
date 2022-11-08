'use strict'

const { illegalKeys, assertPromise } = require('./util')
const traits = require('./traits')

let db

/**
 * @param {import('tape')} test
 */
exports.setUp = function (test, testCommon) {
  test('getMany() setup', async function (t) {
    db = testCommon.factory()
    return db.open()
  })
}

/**
 * @param {import('tape')} test
 */
exports.args = function (test, testCommon) {
  test('getMany() requires an array argument', function (t) {
    t.plan(6)

    db.getMany().catch(function (err) {
      t.is(err.name, 'TypeError')
      t.is(err && err.message, "The first argument 'keys' must be an array")
    })

    db.getMany('foo').catch(function (err) {
      t.is(err.name, 'TypeError')
      t.is(err && err.message, "The first argument 'keys' must be an array")
    })

    db.getMany('foo', {}).catch(function (err) {
      t.is(err.name, 'TypeError')
      t.is(err && err.message, "The first argument 'keys' must be an array")
    })
  })

  test('getMany() with illegal keys', function (t) {
    t.plan(illegalKeys.length * 4)

    for (const { name, key } of illegalKeys) {
      db.getMany([key]).catch(function (err) {
        t.ok(err instanceof Error, name + ' - is Error')
        t.is(err.code, 'LEVEL_INVALID_KEY', name + ' - correct error code')
      })

      db.getMany(['valid', key]).catch(function (err) {
        t.ok(err instanceof Error, name + ' - is Error (second key)')
        t.is(err.code, 'LEVEL_INVALID_KEY', name + ' - correct error code (second key)')
      })
    }
  })
}

/**
 * @param {import('tape')} test
 */
exports.getMany = function (test, testCommon) {
  test('simple getMany()', async function (t) {
    await db.put('foo', 'bar')

    t.same(await assertPromise(db.getMany(['foo'])), ['bar'])
    t.same(await db.getMany(['foo'], {}), ['bar']) // same but with {}
    t.same(await db.getMany(['foo'], { valueEncoding: 'utf8' }), ['bar'])
  })

  test('getMany() with multiple keys', async function (t) {
    await db.put('beep', 'boop')

    t.same(await db.getMany(['foo', 'beep']), ['bar', 'boop'])
    t.same(await db.getMany(['beep', 'foo']), ['boop', 'bar'], 'maintains order of input keys')
  })

  test('empty getMany()', async function (t) {
    t.same(await db.getMany([]), [])

    const encodings = Object.keys(db.supports.encodings)
      .filter(k => db.supports.encodings[k])

    for (const valueEncoding of encodings) {
      t.same(await db.getMany([], { valueEncoding }), [])
    }
  })

  test('getMany() on non-existent keys', async function (t) {
    t.same(await db.getMany(['nope', 'another']), [undefined, undefined])
    t.same(await db.getMany(['beep', 'another']), ['boop', undefined])
    t.same(await db.getMany(['nope', 'beep', Math.random()]), [undefined, 'boop', undefined])

    const encodings = Object.keys(db.supports.encodings)
      .filter(k => db.supports.encodings[k])

    for (const valueEncoding of encodings) {
      t.same(await db.getMany(['nope', 'another'], { valueEncoding }), [undefined, undefined])
    }
  })

  test('simultaneous getMany()', async function (t) {
    t.plan(20)

    await db.put('hello', 'world')
    const promises = []

    for (let i = 0; i < 10; ++i) {
      promises.push(db.getMany(['hello']).then(function (values) {
        t.same(values, ['world'])
      }))
    }

    for (let i = 0; i < 10; ++i) {
      promises.push(db.getMany(['non-existent']).then(function (values) {
        t.same(values, [undefined])
      }))
    }

    return Promise.all(promises)
  })

  traits.open('getMany()', testCommon, async function (t, db) {
    t.same(await assertPromise(db.getMany(['foo'])), [undefined])
  })

  traits.closed('getMany()', testCommon, async function (t, db) {
    return db.getMany(['foo'])
  })

  // Also test empty array because it has a fast-path
  traits.open('getMany() with empty array', testCommon, async function (t, db) {
    t.same(await assertPromise(db.getMany([])), [])
  })

  traits.closed('getMany() with empty array', testCommon, async function (t, db) {
    return db.getMany([])
  })
}

/**
 * @param {import('tape')} test
 */
exports.tearDown = function (test, testCommon) {
  test('getMany() teardown', async function (t) {
    return db.close()
  })
}

/**
 * @param {import('tape')} test
 */
exports.all = function (test, testCommon) {
  exports.setUp(test, testCommon)
  exports.args(test, testCommon)
  exports.getMany(test, testCommon)
  exports.tearDown(test, testCommon)
}
