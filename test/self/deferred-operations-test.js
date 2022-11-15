'use strict'

const test = require('tape')
const { mockLevel, mockIterator } = require('../util')

// NOTE: copied from deferred-leveldown
test('deferred operations are called in order', function (t) {
  t.plan(3)

  const calls = []
  const db = mockLevel({
    async _put (key, value, options) {
      calls.push({ type: 'put', key, value, options })
    },
    async _get (key, options) {
      calls.push({ type: 'get', key, options })
    },
    async _del (key, options) {
      calls.push({ type: 'del', key, options })
    },
    async _batch (arr, options) {
      calls.push({ type: 'batch', keys: arr.map(op => op.key).join(',') })
    },
    async _clear (options) {
      calls.push({ ...options, type: 'clear' })
    },
    _iterator (options) {
      calls.push({ type: 'iterator' })
      return mockIterator(this, options, {
        async _next () {
          calls.push({ type: 'iterator.next' })
        }
      })
    },
    async _open (options) {
      t.is(calls.length, 0, 'not yet called')
    }
  }, {
    encodings: {
      utf8: true,
      buffer: true
    }
  }, {
    keyEncoding: 'utf8',
    valueEncoding: 'utf8'
  })

  db.open().then(function () {
    t.same(calls, [
      { type: 'put', key: '001', value: 'bar1', options: { keyEncoding: 'utf8', valueEncoding: 'utf8' } },
      { type: 'get', key: '002', options: { keyEncoding: 'utf8', valueEncoding: 'utf8' } },
      { type: 'clear', reverse: false, limit: -1, keyEncoding: 'utf8' },
      { type: 'put', key: '010', value: 'bar2', options: { keyEncoding: 'utf8', valueEncoding: 'utf8' } },
      { type: 'get', key: Buffer.from('011'), options: { keyEncoding: 'buffer', valueEncoding: 'utf8' } },
      { type: 'del', key: '020', options: { customOption: 123, keyEncoding: 'utf8' } },
      { type: 'del', key: '021', options: { keyEncoding: 'utf8' } },
      { type: 'batch', keys: '040,041' },
      { type: 'iterator' },
      { type: 'batch', keys: '050,051' },
      { type: 'iterator.next' },
      { type: 'clear', gt: '060', reverse: false, limit: -1, keyEncoding: 'utf8' }
    ], 'calls correctly behaved')
  })

  // We have dangling promises here, but it's a self test, so no worries.
  db.put('001', 'bar1')
  db.get('002')
  db.clear()
  db.put('010', 'bar2')
  db.get('011', { keyEncoding: 'buffer' })
  db.del('020', { customOption: 123 })
  db.del('021')
  db.batch([
    { type: 'put', key: '040', value: 'a' },
    { type: 'put', key: '041', value: 'b' }
  ])
  const it = db.iterator()
  db.batch([
    { type: 'put', key: '050', value: 'c' },
    { type: 'put', key: '051', value: 'd' }
  ])
  it.next()
  db.clear({ gt: '060' })

  t.is(calls.length, 0, 'not yet called')
})
