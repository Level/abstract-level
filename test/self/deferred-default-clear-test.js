'use strict'

const test = require('tape')
const { AbstractLevelDOWN, AbstractIterator } = require('../..')

// NOTE: copied from deferred-leveldown
test('deferred default clear() can schedule other operations itself', function (t) {
  t.plan(3)

  // The default implementation of _clear() uses iterators and calls the
  // private _del() method. Test that those don't go through deferred-leveldown
  // while its state is still 'opening' and is emptying its queue.
  class TestIterator extends AbstractIterator {
    _next (callback) {
      callback(null, keys.shift())
    }
  }

  class Test extends AbstractLevelDOWN {
    _iterator (options) {
      return new TestIterator(this)
    }

    _del (key, options, callback) {
      t.is(key, 'foo')
      this._nextTick(callback)
    }
  }

  const db = new Test()
  const keys = ['foo']

  t.is(db.status, 'opening')
  db.clear(t.ifError.bind(t))
})
