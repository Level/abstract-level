'use strict'

const isBuffer = require('is-buffer')
const { Buffer } = require('buffer')

exports.clear = function (test, testCommon) {
  makeTest('string', ['a', 'b'])

  if (testCommon.supports.encodings.buffer) {
    makeTest('buffer', [Buffer.from('a'), Buffer.from('b')])
    makeTest('mixed', [Buffer.from('a'), 'b'])

    // These keys would be equal when compared as utf8 strings
    makeTest('non-utf8 buffer', [Buffer.from('80', 'hex'), Buffer.from('c0', 'hex')])
  }

  function makeTest (type, keys) {
    test('simple clear() on ' + type + ' keys', async function (t) {
      const db = testCommon.factory()
      const ops = keys.map(function (key) {
        return {
          type: 'put',
          key,
          value: 'foo',
          keyEncoding: isBuffer(key) ? 'buffer' : 'utf8'
        }
      })

      await db.open()
      await db.batch(ops)
      t.is((await db.iterator().all()).length, keys.length, 'has entries')

      await db.clear()
      t.is((await db.iterator().all()).length, 0, 'has no entries')

      return db.close()
    })
  }

  // NOTE: adapted from levelup
  for (const deferred of [false, true]) {
    for (const [gte, keyEncoding] of [['"b"', 'utf8'], ['b', 'json']]) {
      test(`clear() with ${keyEncoding} encoding (deferred: ${deferred})`, async function (t) {
        const db = testCommon.factory()

        await db.open()
        await db.batch([
          { type: 'put', key: '"a"', value: 'a' },
          { type: 'put', key: '"b"', value: 'b' }
        ])

        let promise

        if (deferred) {
          await db.close()
          t.is(db.status, 'closed')
          promise = db.open()
          t.is(db.status, 'opening')
        }

        await db.clear({ gte, keyEncoding })
        await promise

        const keys = await db.keys().all()
        t.same(keys, ['"a"'], 'got expected keys')

        return db.close()
      })
    }
  }
}

exports.events = function (test, testCommon) {
  test('test clear() with options emits clear event', async function (t) {
    t.plan(2)

    const db = testCommon.factory()
    await db.open()

    t.ok(db.supports.events.clear)

    db.on('clear', function (options) {
      t.same(options, { gt: 567, custom: 123 })
    })

    await db.clear({ gt: 567, custom: 123 })
    return db.close()
  })

  test('test clear() without options emits clear event', async function (t) {
    t.plan(2)

    const db = testCommon.factory()
    await db.open()

    t.ok(db.supports.events.clear)

    db.on('clear', function (options) {
      t.same(options, {})
    })

    await db.clear()
    return db.close()
  })
}

exports.all = function (test, testCommon) {
  exports.events(test, testCommon)
  exports.clear(test, testCommon)
}
