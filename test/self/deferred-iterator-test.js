'use strict'

const test = require('tape')
const { DeferredIterator, DeferredKeyIterator, DeferredValueIterator } = require('../../lib/deferred-iterator')
const { AbstractIterator, AbstractKeyIterator, AbstractValueIterator } = require('../..')
const { mockLevel } = require('../util')
const noop = () => {}
const identity = (v) => v

for (const mode of ['iterator', 'keys', 'values']) {
  const RealCtor = mode === 'iterator' ? AbstractIterator : mode === 'keys' ? AbstractKeyIterator : AbstractValueIterator
  const DeferredCtor = mode === 'iterator' ? DeferredIterator : mode === 'keys' ? DeferredKeyIterator : DeferredValueIterator
  const nextArg = mode === 'iterator' ? ['key', 'value'] : mode === 'keys' ? 'key' : 'value'
  const privateMethod = '_' + mode
  const publicMethod = mode

  // NOTE: adapted from deferred-leveldown
  test(`deferred ${mode}().next()`, async function (t) {
    t.plan(5)

    const keyEncoding = {
      format: 'utf8',
      encode (key) {
        t.is(key, 'foo', 'encoding got key')
        return key.toUpperCase()
      },
      decode: identity
    }

    class MockIterator extends RealCtor {
      async _next () {
        return nextArg
      }

      async _close () {}
    }

    const db = mockLevel({
      [privateMethod]: function (options) {
        t.is(options.gt, 'FOO', 'got encoded range option')
        return new MockIterator(this, options)
      },
      async _open (options) {
        t.pass('opened')
      }
    }, { encodings: { utf8: true } }, {
      keyEncoding
    })

    const it = db[publicMethod]({ gt: 'foo' })
    t.ok(it instanceof DeferredCtor, 'is deferred')

    t.is(await it.next(), nextArg)
    return it.close()
  })

  // NOTE: adapted from deferred-leveldown
  test(`deferred ${mode}(): non-deferred operations`, function (t) {
    t.plan(4)

    class MockIterator extends RealCtor {
      _seek (target) {
        t.is(target, '123')
      }

      async _next () {
        return nextArg
      }
    }

    const db = mockLevel({
      [privateMethod]: function (options) {
        return new MockIterator(this, options)
      }
    })

    // TODO: async/await
    db.open().then(function () {
      it.seek(123)
      it.next().then(function (item) {
        t.is(item, nextArg)
        it.close().then(t.pass.bind(t, 'closed'))
      })
    })

    const it = db[publicMethod]({ gt: 'foo' })
    t.ok(it instanceof DeferredCtor)
  })

  // NOTE: adapted from deferred-leveldown
  test(`deferred ${mode}(): iterators are created in order`, function (t) {
    t.plan(4)

    const order1 = []
    const order2 = []

    class MockIterator extends RealCtor {}

    function db (order) {
      return mockLevel({
        [privateMethod]: function (options) {
          order.push('iterator created')
          return new MockIterator(this, options)
        },
        async _put (key, value, options) {
          order.push('put')
        }
      })
    }

    const db1 = db(order1)
    const db2 = db(order2)

    db1.open().then(function () {
      t.same(order1, ['iterator created', 'put'])
    })

    db2.open().then(function () {
      t.same(order2, ['put', 'iterator created'])
    })

    t.ok(db1[publicMethod]() instanceof DeferredCtor)
    db1.put('key', 'value', noop)

    db2.put('key', 'value', noop)
    t.ok(db2[publicMethod]() instanceof DeferredCtor)
  })

  for (const method of ['next', 'nextv', 'all']) {
    test(`deferred ${mode}(): closed upon failed open, verified by ${method}()`, function (t) {
      t.plan(5)

      const db = mockLevel({
        async _open (options) {
          t.pass('opening')
          throw new Error('_open error')
        },
        _iterator () {
          t.fail('should not be called')
        },
        [privateMethod] () {
          t.fail('should not be called')
        }
      })

      const it = db[publicMethod]()
      t.ok(it instanceof DeferredCtor)

      const original = it._close
      it._close = async function (...args) {
        t.pass('closed')
        return original.call(this, ...args)
      }

      verifyClosed(t, it, method, () => {})
    })

    test(`deferred ${mode}(): deferred and real iterators are closed on db.close(), verified by ${method}()`, function (t) {
      t.plan(8)

      class MockIterator extends RealCtor {
        async _close () {
          t.pass('closed')
        }
      }

      const db = mockLevel({
        [privateMethod] (options) {
          return new MockIterator(this, options)
        }
      })

      const it = db[publicMethod]()
      t.ok(it instanceof DeferredCtor)

      const original = it._close
      it._close = async function (...args) {
        t.pass('closed')
        return original.call(this, ...args)
      }

      // TODO: async/await
      db.open().then(() => db.close()).then(function () {
        verifyClosed(t, it, method, function () {
          db.open().then(function () {
            // Should still be closed
            verifyClosed(t, it, method, function () {
              db.close().then(t.pass.bind(t))
            })
          })
        })
      })
    })
  }

  test(`deferred ${mode}(): deferred and real iterators are detached on db.close()`, async function (t) {
    class MockIterator extends RealCtor {}

    let real
    const db = mockLevel({
      [privateMethod] (options) {
        real = new MockIterator(this, options)
        return real
      }
    })

    const it = db[publicMethod]()
    t.ok(it instanceof DeferredCtor)

    const calls = []
    const wrap = (obj, name) => {
      const original = obj.close

      obj.close = async function (...args) {
        calls.push(name)
        return original.apply(this, args)
      }
    }

    // First open(), to also create the real iterator.
    await db.open()

    wrap(it, 'deferred')
    wrap(real, 'real')

    await db.close()

    // There may have been 2 real.close() calls: one by the db closing resources, and
    // another by the deferred iterator that wraps real. Not relevant for this test.
    t.same(calls.splice(0, calls.length).slice(0, 2), ['deferred', 'real'])

    // Reopen. Resources should be detached at this point.
    await db.open()
    await db.close()

    // So close() should not have been called again.
    t.same(calls, [], 'no new calls')
  })

  test(`deferred ${mode}(): defers underlying close()`, function (t) {
    t.plan(2)

    class MockIterator extends RealCtor {
      async _close () {
        order.push('_close')
      }
    }

    const order = []
    const db = mockLevel({
      async _open (options) {
        order.push('_open')
      },
      [privateMethod] (options) {
        order.push(privateMethod)
        return new MockIterator(this, options)
      }
    })

    const it = db[publicMethod]()
    t.ok(it instanceof DeferredCtor)

    it.close().then(function () {
      t.same(order, ['_open', privateMethod, '_close'])
    })
  })

  globalThis.AbortController && test(`deferred ${mode}(): skips real iterator if aborted`, function (t) {
    t.plan(3)

    const order = []
    const db = mockLevel({
      async _open (options) {
        order.push('_open')
      },
      [privateMethod] (options) {
        t.fail('should not be called')
      }
    })

    const ac = new globalThis.AbortController()
    const it = db[publicMethod]({ signal: ac.signal })
    t.ok(it instanceof DeferredCtor)

    // Test synchronous call, which should be silently skipped on abort
    it.seek('foo')

    // Test asynchronous call, which should be rejected
    it.next().then(t.fail.bind(t, 'should not succeed'), function (err) {
      t.is(err.code, 'LEVEL_ABORTED')
    })

    // Signal should prevent real iterator from being created.
    ac.abort()

    it.close().then(function () {
      t.same(order, ['_open'])
    })
  })

  // TODO: async/await
  const verifyClosed = function (t, it, method, cb) {
    const requiredArgs = method === 'nextv' ? [10] : []

    it[method](...requiredArgs).then(t.fail.bind(t, 'should not succeed'), function (err) {
      t.is(err && err.code, 'LEVEL_ITERATOR_NOT_OPEN', `correct error on first ${method}()`)

      // Should account for userland code that ignores errors
      it[method](...requiredArgs).then(t.fail.bind(t, 'should not succeed'), function (err) {
        t.is(err && err.code, 'LEVEL_ITERATOR_NOT_OPEN', `correct error on second ${method}()`)
        cb()
      })
    })
  }
}
