'use strict'

const test = require('tape')
const DeferredIterator = require('../../lib/deferred-iterator')
const { mockDown, mockIterator } = require('../util')
const noop = () => {}

// NOTE: copied from deferred-leveldown
test('deferred iterator', function (t) {
  t.plan(9)

  const keyEncoding = {
    format: 'utf8',
    encode (key) {
      t.is(key, 'foo', 'encoding got key')
      return key.toUpperCase()
    }
  }

  const db = mockDown({
    _iterator: function (options) {
      t.is(options.gt, 'FOO', 'got encoded range option')

      return mockIterator(this, options, {
        _next: function (cb) {
          this.nextTick(cb, null, 'key', 'value')
        },
        _close: function (cb) {
          this.nextTick(cb)
        }
      })
    },
    _open: function (options, callback) {
      t.pass('opened')
      this.nextTick(callback)
    }
  }, { encodings: { utf8: true } }, {
    keyEncoding
  })

  const it = db.iterator({ gt: 'foo' })
  t.ok(it instanceof DeferredIterator, 'is deferred')

  let nextFirst = false

  it.next(function (err, key, value) {
    nextFirst = true
    t.error(err, 'no next() error')
    t.equal(key, 'key')
    t.equal(value, 'value')
  })

  it.close(function (err) {
    t.error(err, 'no close() error')
    t.ok(nextFirst)
  })
})

// NOTE: copied from deferred-leveldown
test('deferred iterator - non-deferred operations', function (t) {
  t.plan(7)

  const db = mockDown({
    _iterator: function (options) {
      return mockIterator(this, options, {
        _seek (target) {
          t.is(target, '123')
        },
        _next (cb) {
          this.nextTick(cb, null, 'key', 'value')
        }
      })
    }
  })

  db.open(function (err) {
    t.error(err, 'no open() error')

    it.seek(123)
    it.next(function (err, key, value) {
      t.error(err, 'no next() error')
      t.equal(key, 'key')
      t.equal(value, 'value')

      it.close(function (err) {
        t.error(err, 'no close() error')
      })
    })
  })

  const it = db.iterator({ gt: 'foo' })
  t.ok(it instanceof DeferredIterator)
})

// NOTE: copied from deferred-leveldown
test('deferred iterators are created in order', function (t) {
  t.plan(6)

  const order1 = []
  const order2 = []

  function db (order) {
    return mockDown({
      _iterator: function (options) {
        order.push('iterator created')
        return mockIterator(this, options, {})
      },
      _put: function (key, value, options, callback) {
        order.push('put')
      },
      _open: function (options, callback) {
        this.nextTick(callback)
      }
    })
  }

  const db1 = db(order1)
  const db2 = db(order2)

  db1.open(function (err) {
    t.error(err, 'no error')
    t.same(order1, ['iterator created', 'put'])
  })

  db2.open(function (err) {
    t.error(err, 'no error')
    t.same(order2, ['put', 'iterator created'])
  })

  t.ok(db1.iterator() instanceof DeferredIterator)
  db1.put('key', 'value', noop)

  db2.put('key', 'value', noop)
  t.ok(db2.iterator() instanceof DeferredIterator)
})

test('deferred iterator is closed upon failed open', function (t) {
  t.plan(5)

  const db = mockDown({
    _open (options, callback) {
      t.pass('opening')
      this.nextTick(callback, new Error('_open error'))
    },
    _iterator () {
      t.fail('should not be called')
    }
  })

  const it = db.iterator()
  t.ok(it instanceof DeferredIterator)

  const original = it._close
  it._close = function (...args) {
    t.pass('closed')
    return original.call(this, ...args)
  }

  verifyClosed(t, it, () => {})
})

test('deferred iterator and real iterator are closed on db.close()', function (t) {
  t.plan(10)

  const db = mockDown({
    _iterator (options) {
      return mockIterator(this, options, {
        _close (callback) {
          t.pass('closed')
          this.nextTick(callback)
        }
      })
    }
  })

  const it = db.iterator()
  t.ok(it instanceof DeferredIterator)

  const original = it._close
  it._close = function (...args) {
    t.pass('closed')
    return original.call(this, ...args)
  }

  db.close(function (err) {
    t.ifError(err, 'no close() error')

    verifyClosed(t, it, function () {
      db.open(function (err) {
        t.ifError(err, 'no open() error')

        // Should still be closed
        verifyClosed(t, it, function () {
          db.close(t.ifError.bind(t))
        })
      })
    })
  })
})

test('deferred iterator and real iterator are detached on db.close()', function (t) {
  t.plan(4)

  let real
  const db = mockDown({
    _iterator (options) {
      real = mockIterator(this, options)
      return real
    }
  })

  const it = db.iterator()
  t.ok(it instanceof DeferredIterator)

  db.close(function (err) {
    t.ifError(err, 'no close() error')

    db.open(function (err) {
      t.ifError(err, 'no open() error')

      it.close = real.close = it._close = real._close = function () {
        t.fail('should not be called')
      }

      db.close(t.ifError.bind(t))
    })
  })
})

test('deferred iterator defers underlying close()', function (t) {
  t.plan(3)

  const order = []
  const db = mockDown({
    _open (options, callback) {
      order.push('_open')
      this.nextTick(callback)
    },
    _iterator (options) {
      order.push('_iterator')
      return mockIterator(this, options, {
        _close (callback) {
          order.push('_close')
          this.nextTick(callback)
        }
      })
    }
  })

  const it = db.iterator()
  t.ok(it instanceof DeferredIterator)

  it.close(function (err) {
    t.ifError(err, 'no close() error')
    t.same(order, ['_open', '_iterator', '_close'])
  })
})

function verifyClosed (t, it, cb) {
  it.next(function (err) {
    t.is(err && err.code, 'LEVEL_ITERATOR_NOT_OPEN', 'correct error on first next()')

    // Should account for userland code that ignores errors
    it.next(function (err) {
      t.is(err && err.code, 'LEVEL_ITERATOR_NOT_OPEN', 'correct error on second next()')
      cb()
    })
  })
}
