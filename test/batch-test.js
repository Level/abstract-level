'use strict'

const { Buffer } = require('buffer')
const { illegalKeys, illegalValues } = require('./util')

let db

exports.setUp = function (test, testCommon) {
  test('batch([]) setup', async function (t) {
    db = testCommon.factory()
    return db.open()
  })
}

exports.args = function (test, testCommon) {
  test('batch([]) with missing value fails', function (t) {
    t.plan(1)

    db.batch([{ type: 'put', key: 'foo1' }]).catch((err) => {
      t.is(err.code, 'LEVEL_INVALID_VALUE', 'correct error code')
    })
  })

  test('batch([]) with illegal values fails', function (t) {
    t.plan(illegalValues.length * 2)

    for (const { name, value } of illegalValues) {
      db.batch([{ type: 'put', key: 'foo1', value }]).catch(function (err) {
        t.ok(err instanceof Error, name + ' - is Error')
        t.is(err.code, 'LEVEL_INVALID_VALUE', name + ' - correct error code')
      })
    }
  })

  test('batch([]) with missing key fails', function (t) {
    t.plan(1)

    db.batch([{ type: 'put', value: 'foo1' }]).catch(function (err) {
      t.is(err.code, 'LEVEL_INVALID_KEY', 'correct error code')
    })
  })

  test('batch([]) with illegal keys fails', function (t) {
    t.plan(illegalKeys.length * 2)

    for (const { name, key } of illegalKeys) {
      db.batch([{ type: 'put', key, value: 'foo1' }]).catch(function (err) {
        t.ok(err instanceof Error, name + ' - is Error')
        t.is(err.code, 'LEVEL_INVALID_KEY', name + ' - correct error code')
      })
    }
  })

  test('batch([]) with missing or incorrect type fails', function (t) {
    t.plan(4)

    db.batch([{ key: 'key', value: 'value' }]).catch(function (err) {
      t.is(err.name, 'TypeError')
      t.is(err.message, "A batch operation must have a type property that is 'put' or 'del'", 'correct error message')
    })

    db.batch([{ key: 'key', value: 'value', type: 'foo' }]).catch(function (err) {
      t.is(err.name, 'TypeError')
      t.is(err.message, "A batch operation must have a type property that is 'put' or 'del'", 'correct error message')
    })
  })

  test('batch([]) with missing or nullish operations fails', function (t) {
    t.plan(2 * 2)

    for (const array of [null, undefined]) {
      db.batch(array).catch(function (err) {
        t.is(err.name, 'TypeError')
        t.is(err.message, "The first argument 'operations' must be an array", 'correct error message')
      })
    }
  })

  test('batch([]) with empty operations array and empty options', async function (t) {
    await db.batch([])
    await db.batch([], null)
    await db.batch([], undefined)
    await db.batch([], {})
  })

  ;[null, undefined, 1, true].forEach(function (operation) {
    const type = operation === null ? 'null' : typeof operation

    test(`batch([]) with ${type} operation fails`, function (t) {
      t.plan(1)

      db.batch([operation]).catch(function (err) {
        // We can either explicitly check the type of the op and throw a TypeError,
        // or skip that for performance reasons in which case the next thing checked
        // will be op.key or op.type. Doesn't matter, because we've documented that
        // TypeErrors and such are not part of the semver contract.
        t.ok(err.name === 'TypeError' || err.code === 'LEVEL_INVALID_KEY')
      })
    })
  })
}

exports.batch = function (test, testCommon) {
  test('simple batch([])', async function (t) {
    const db = testCommon.factory()
    await db.open()
    await db.batch([{ type: 'del', key: 'non-existent' }]) // should not error
    t.is(await db.get('foo'), undefined, 'not found')
    await db.batch([{ type: 'put', key: 'foo', value: 'bar' }])
    t.is(await db.get('foo'), 'bar')
    await db.batch([{ type: 'del', key: 'foo' }])
    t.is(await db.get('foo'), undefined, 'not found')
    return db.close()
  })

  test('batch([]) with multiple operations', async function (t) {
    t.plan(3)

    await db.batch([
      { type: 'put', key: 'foobatch1', value: 'bar1' },
      { type: 'put', key: 'foobatch2', value: 'bar2' },
      { type: 'put', key: 'foobatch3', value: 'bar3' },
      { type: 'del', key: 'foobatch2' }
    ])

    const promises = [
      db.get('foobatch1').then(function (value) {
        t.is(value, 'bar1')
      }),
      db.get('foobatch2').then(function (value) {
        t.is(value, undefined, 'not found')
      }),
      db.get('foobatch3').then(function (value) {
        t.is(value, 'bar3')
      })
    ]

    return Promise.all(promises)
  })

  for (const encoding of ['utf8', 'buffer', 'view']) {
    if (!testCommon.supports.encodings[encoding]) continue

    // NOTE: adapted from memdown
    test(`empty values in batch with ${encoding} valueEncoding`, async function (t) {
      const db = testCommon.factory({ valueEncoding: encoding })
      const values = ['', Uint8Array.from([]), Buffer.alloc(0)]
      const expected = encoding === 'utf8' ? values[0] : encoding === 'view' ? values[1] : values[2]

      await db.open()
      await db.batch(values.map((value, i) => ({ type: 'put', key: String(i), value })))

      for (let i = 0; i < values.length; i++) {
        const value = await db.get(String(i))

        // Buffer is a Uint8Array, so this is allowed
        if (encoding === 'view' && Buffer.isBuffer(value)) {
          t.same(value, values[2])
        } else {
          t.same(value, expected)
        }
      }

      return db.close()
    })

    test(`empty keys in batch with ${encoding} keyEncoding`, async function (t) {
      const db = testCommon.factory({ keyEncoding: encoding })
      const keys = ['', Uint8Array.from([]), Buffer.alloc(0)]

      await db.open()

      for (let i = 0; i < keys.length; i++) {
        await db.batch([{ type: 'put', key: keys[i], value: String(i) }])
        t.same(await db.get(keys[i]), String(i), `got value ${i}`)
      }

      return db.close()
    })
  }
}

exports.atomic = function (test, testCommon) {
  test('batch([]) is atomic', async function (t) {
    t.plan(3)

    try {
      await db.batch([
        { type: 'put', key: 'foobah1', value: 'bar1' },
        { type: 'put', value: 'bar2' },
        { type: 'put', key: 'foobah3', value: 'bar3' }
      ])
    } catch (err) {
      t.is(err.code, 'LEVEL_INVALID_KEY', 'should error and not commit anything')
    }

    t.is(await db.get('foobah1'), undefined, 'not found')
    t.is(await db.get('foobah3'), undefined, 'not found')
  })
}

exports.tearDown = function (test, testCommon) {
  test('batch([]) teardown', async function (t) {
    return db.close()
  })
}

exports.all = function (test, testCommon) {
  exports.setUp(test, testCommon)
  exports.args(test, testCommon)
  exports.batch(test, testCommon)
  exports.atomic(test, testCommon)
  exports.tearDown(test, testCommon)
}
