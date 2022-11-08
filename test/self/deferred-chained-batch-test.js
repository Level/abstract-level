'use strict'

const test = require('tape')
const { mockLevel } = require('../util')
const { DefaultChainedBatch } = require('../../lib/default-chained-batch')
const identity = (v) => v

// NOTE: adapted from deferred-leveldown
test('deferred chained batch encodes once', async function (t) {
  t.plan(8)

  let called = false

  const keyEncoding = {
    format: 'utf8',
    encode (key) {
      t.is(called, false, 'not yet called')
      t.is(key, 'foo')
      return key.toUpperCase()
    },
    decode: identity
  }

  const valueEncoding = {
    format: 'utf8',
    encode (value) {
      t.is(called, false, 'not yet called')
      t.is(value, 'bar')
      return value.toUpperCase()
    },
    decode: identity
  }

  const db = mockLevel({
    async _batch (array, options) {
      called = true
      t.is(array[0] && array[0].key, 'FOO')
      t.is(array[0] && array[0].value, 'BAR')
    },
    async _open (options) {
      t.is(called, false, 'not yet called')
    }
  }, { encodings: { utf8: true } }, {
    keyEncoding,
    valueEncoding
  })

  db.once('open', function () {
    t.is(called, true, 'called')
  })

  return db.batch().put('foo', 'bar').write()
})

test('deferred chained batch is closed upon failed open', function (t) {
  t.plan(6)

  const db = mockLevel({
    async _open (options) {
      t.pass('opening')
      throw new Error('_open error')
    },
    async _batch () {
      t.fail('should not be called')
    }
  })

  const batch = db.batch()
  t.ok(batch instanceof DefaultChainedBatch)

  batch.put('foo', 'bar')
  batch.del('123')

  batch.write().then(t.fail.bind(t), function (err) {
    t.is(err.code, 'LEVEL_BATCH_NOT_OPEN')

    // Should account for userland code that ignores errors
    try {
      batch.put('beep', 'boop')
    } catch (err) {
      t.is(err && err.code, 'LEVEL_BATCH_NOT_OPEN')
    }

    try {
      batch.del('456')
    } catch (err) {
      t.is(err && err.code, 'LEVEL_BATCH_NOT_OPEN')
    }

    batch.write().catch(function (err) {
      t.is(err && err.code, 'LEVEL_BATCH_NOT_OPEN')
    })
  })
})
