'use strict'

const test = require('tape')
const { AbstractLevelDOWN, AbstractIterator } = require('../..')
const DeferredIterator = require('../../lib/deferred-iterator')

function withIterator (methods) {
  class TestIterator extends AbstractIterator { }

  for (const k in methods) {
    TestIterator.prototype[k] = methods[k]
  }

  class Test extends AbstractLevelDOWN {
    _iterator () {
      return new TestIterator(this)
    }
  }

  return new Test()
}

for (const type of ['explicit', 'deferred']) {
  function verify (t, db, it) {
    t.is(db.status, type === 'explicit' ? 'open' : 'opening')
    t.is(it.constructor === DeferredIterator, type !== 'explicit')
  }

  test(`for await...of db.iterator() (${type} open)`, async function (t) {
    t.plan(4)

    const input = [{ key: '1', value: '1' }, { key: '2', value: '2' }]
    const output = []

    const db = withIterator({
      _next (callback) {
        const { key, value } = input[n++] || {}
        this._nextTick(callback, null, key, value)
      },

      _close (callback) {
        this._nextTick(function () {
          closed = true
          callback()
        })
      }
    })

    if (type === 'explicit') await db.open()
    const it = db.iterator({ keyAsBuffer: false, valueAsBuffer: false })
    verify(t, db, it)

    let n = 0
    let closed = false

    for await (const [key, value] of it) {
      output.push({ key, value })
    }

    t.same(output, input)
    t.ok(closed, 'closed')
  })

  test(`for await...of db.iterator() closes on user error (${type} open)`, async function (t) {
    t.plan(4)

    const db = withIterator({
      _next (callback) {
        this._nextTick(callback, null, n.toString(), n.toString())
        if (n++ > 10) throw new Error('Infinite loop')
      },

      _close (callback) {
        this._nextTick(function () {
          closed = true
          callback(new Error('close error'))
        })
      }
    })

    if (type === 'explicit') await db.open()
    const it = db.iterator()
    verify(t, db, it)

    let n = 0
    let closed = false

    try {
      // eslint-disable-next-line no-unused-vars, no-unreachable-loop
      for await (const kv of it) {
        throw new Error('user error')
      }
    } catch (err) {
      t.is(err.message, 'user error')
      t.ok(closed, 'closed')
    }
  })

  test(`for await...of db.iterator() with user error and close() error (${type} open)`, async function (t) {
    t.plan(4)

    const db = withIterator({
      _next (callback) {
        this._nextTick(callback, null, n.toString(), n.toString())
        if (n++ > 10) throw new Error('Infinite loop')
      },

      _close (callback) {
        this._nextTick(function () {
          closed = true
          callback(new Error('close error'))
        })
      }
    })

    if (type === 'explicit') await db.open()
    const it = db.iterator()
    verify(t, db, it)

    let n = 0
    let closed = false

    try {
      // eslint-disable-next-line no-unused-vars, no-unreachable-loop
      for await (const kv of it) {
        throw new Error('user error')
      }
    } catch (err) {
      // TODO: ideally, this would be a combined aka aggregate error
      t.is(err.message, 'user error')
      t.ok(closed, 'closed')
    }
  })

  test(`for await...of db.iterator() closes on iterator error (${type} open)`, async function (t) {
    t.plan(5)

    const db = withIterator({
      _next (callback) {
        t.pass('nexted')
        this._nextTick(callback, new Error('iterator error'))
      },

      _close (callback) {
        this._nextTick(function () {
          closed = true
          callback()
        })
      }
    })

    if (type === 'explicit') await db.open()
    const it = db.iterator()
    verify(t, db, it)

    let closed = false

    try {
      // eslint-disable-next-line no-unused-vars
      for await (const kv of it) {
        t.fail('should not yield results')
      }
    } catch (err) {
      t.is(err.message, 'iterator error')
      t.ok(closed, 'closed')
    }
  })

  test(`for await...of db.iterator() with iterator error and close() error (${type} open)`, async function (t) {
    t.plan(5)

    const db = withIterator({
      _next (callback) {
        t.pass('nexted')
        this._nextTick(callback, new Error('iterator error'))
      },

      _close (callback) {
        this._nextTick(function () {
          closed = true
          callback(new Error('close error'))
        })
      }
    })

    if (type === 'explicit') await db.open()
    const it = db.iterator()
    verify(t, db, it)

    let closed = false

    try {
      // eslint-disable-next-line no-unused-vars
      for await (const kv of it) {
        t.fail('should not yield results')
      }
    } catch (err) {
      // TODO: ideally, this would be a combined aka aggregate error
      t.is(err.message, 'close error')
      t.ok(closed, 'closed')
    }
  })

  test(`for await...of db.iterator() closes on user break (${type} open)`, async function (t) {
    t.plan(4)

    const db = withIterator({
      _next (callback) {
        this._nextTick(callback, null, n.toString(), n.toString())
        if (n++ > 10) throw new Error('Infinite loop')
      },

      _close (callback) {
        this._nextTick(function () {
          closed = true
          callback()
        })
      }
    })

    if (type === 'explicit') await db.open()
    const it = db.iterator()
    verify(t, db, it)

    let n = 0
    let closed = false

    // eslint-disable-next-line no-unused-vars, no-unreachable-loop
    for await (const kv of it) {
      t.pass('got a chance to break')
      break
    }

    t.ok(closed, 'closed')
  })

  test(`for await...of db.iterator() with user break and close() error (${type} open)`, async function (t) {
    t.plan(5)

    const db = withIterator({
      _next (callback) {
        this._nextTick(callback, null, n.toString(), n.toString())
        if (n++ > 10) throw new Error('Infinite loop')
      },

      _close (callback) {
        this._nextTick(function () {
          closed = true
          callback(new Error('close error'))
        })
      }
    })

    if (type === 'explicit') await db.open()
    const it = db.iterator()
    verify(t, db, it)

    let n = 0
    let closed = false

    try {
      // eslint-disable-next-line no-unused-vars, no-unreachable-loop
      for await (const kv of it) {
        t.pass('got a chance to break')
        break
      }
    } catch (err) {
      t.is(err.message, 'close error')
      t.ok(closed, 'closed')
    }
  })
}
