'use strict'

const test = require('tape')
const { mockDown, mockIterator } = require('../util')

// NOTE: copied from deferred-leveldown
test('deferred operations are called in order', function (t) {
  t.plan(15)

  const calls = []
  const db = mockDown({
    _put: function (key, value, options, callback) {
      this._nextTick(callback)
      calls.push({ type: 'put', key, value, options })
    },
    _get: function (key, options, callback) {
      this._nextTick(callback)
      calls.push({ type: 'get', key, options })
    },
    _del: function (key, options, callback) {
      this._nextTick(callback)
      calls.push({ type: 'del', key, options })
    },
    _batch: function (arr, options, callback) {
      this._nextTick(callback)
      calls.push({ type: 'batch', keys: arr.map(op => op.key).join(',') })
    },
    _clear: function (options, callback) {
      this._nextTick(callback)
      calls.push({ ...options, type: 'clear' })
    },
    _iterator () {
      calls.push({ type: 'iterator' })
      return mockIterator(this, {
        _next (callback) {
          this._nextTick(callback)
          calls.push({ type: 'iterator.next' })
        }
      })
    },
    _open: function (options, callback) {
      this._nextTick(callback)
      t.is(calls.length, 0, 'not yet called')
    }
  })

  db.open(function (err) {
    t.ifError(err, 'no open() error')
    t.same(calls, [
      { type: 'put', key: '001', value: 'bar1', options: {} },
      { type: 'get', key: '002', options: { asBuffer: true } },
      { type: 'clear', reverse: false, limit: -1 },
      { type: 'put', key: '010', value: 'bar2', options: {} },
      { type: 'get', key: '011', options: { asBuffer: false } },
      { type: 'del', key: '020', options: { customOption: 123 } },
      { type: 'del', key: '021', options: {} },
      { type: 'batch', keys: '040,041' },
      { type: 'iterator' },
      { type: 'batch', keys: '050,051' },
      { type: 'iterator.next' },
      { type: 'clear', gt: '060', reverse: false, limit: -1 }
    ], 'calls correctly behaved')
  })

  db.put('001', 'bar1', t.ifError.bind(t))
  db.get('002', t.ifError.bind(t))
  db.clear(t.ifError.bind(t))
  db.put('010', 'bar2', t.ifError.bind(t))
  db.get('011', { asBuffer: false }, t.ifError.bind(t))
  db.del('020', { customOption: 123 }, t.ifError.bind(t))
  db.del('021', t.ifError.bind(t))
  db.batch([
    { type: 'put', key: '040', value: 'a' },
    { type: 'put', key: '041', value: 'b' }
  ], t.ifError.bind(t))
  const it = db.iterator()
  db.batch()
    .put('050', 'c')
    .put('051', 'd')
    .write(t.ifError.bind(t))
  it.next(t.ifError.bind(t))
  db.clear({ gt: '060' }, t.ifError.bind(t))

  t.is(calls.length, 0, 'not yet called')
})
