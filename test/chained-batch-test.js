'use strict'

const collectEntries = require('level-concat-iterator')

let db

function collectBatchOps (batch) {
  const _put = batch._put
  const _del = batch._del
  const _operations = []

  if (typeof _put !== 'function' || typeof _del !== 'function') {
    return batch._operations
  }

  batch._put = function (key, value) {
    _operations.push({ type: 'put', key, value })
    return _put.apply(this, arguments)
  }

  batch._del = function (key) {
    _operations.push({ type: 'del', key })
    return _del.apply(this, arguments)
  }

  return _operations
}

exports.setUp = function (test, testCommon) {
  test('setUp common', testCommon.setUp)
  test('setUp db', function (t) {
    db = testCommon.factory()
    db.open(t.end.bind(t))
  })
}

exports.args = function (test, testCommon) {
  test('test batch has db reference', function (t) {
    t.ok(db.batch().db === db)
    t.end()
  })

  test('test batch#put() with missing, null or undefined `value`', function (t) {
    t.plan(3 * 2)

    for (const args of [[null], [undefined], []]) {
      const batch = db.batch()

      try {
        batch.put('key', ...args)
      } catch (err) {
        t.is(err.message, 'value cannot be `null` or `undefined`', 'correct error message')
        t.is(batch.length, 0, 'length is not incremented on error')
      }
    }
  })

  test('test batch#put() with null or undefined `key`', function (t) {
    t.plan(2 * 2)

    for (const key of [null, undefined]) {
      const batch = db.batch()

      try {
        batch.put(key, 'foo1')
      } catch (err) {
        t.equal(err.message, 'key cannot be `null` or `undefined`', 'correct error message')
        t.is(batch.length, 0, 'length is not incremented on error')
      }
    }
  })

  test('test batch#put() with missing `key` and `value`', function (t) {
    t.plan(2)

    const batch = db.batch()

    try {
      batch.put()
    } catch (err) {
      t.equal(err.message, 'key cannot be `null` or `undefined`', 'correct error message')
      t.is(batch.length, 0, 'length is not incremented on error')
    }
  })

  test('test batch#del() with missing, null or undefined `key`', function (t) {
    t.plan(3 * 2)

    for (const args of [[null], [undefined], []]) {
      const batch = db.batch()

      try {
        batch.del(...args)
      } catch (err) {
        t.equal(err.message, 'key cannot be `null` or `undefined`', 'correct error message')
        t.is(batch.length, 0, 'length is not incremented on error')
      }
    }
  })

  test('test batch#clear() doesn\'t throw', function (t) {
    db.batch().clear()
    t.end()
  })

  testCommon.promises || test('test batch#write() with no callback', function (t) {
    try {
      db.batch().write()
    } catch (err) {
      t.equal(err.message, 'write() requires a callback argument', 'correct error message')
      return t.end()
    }
    t.fail('should have thrown')
    t.end()
  })

  test('test batch#put() after write()', function (t) {
    const batch = db.batch().put('foo', 'bar')
    batch.write(function () {})
    try {
      batch.put('boom', 'bang')
    } catch (err) {
      t.equal(err.message, 'write() already called on this batch', 'correct error message')
      return t.end()
    }
    t.fail('should have thrown')
    t.end()
  })

  test('test batch#del() after write()', function (t) {
    const batch = db.batch().put('foo', 'bar')
    batch.write(function () {})
    try {
      batch.del('foo')
    } catch (err) {
      t.equal(err.message, 'write() already called on this batch', 'correct error message')
      return t.end()
    }
    t.fail('should have thrown')
    t.end()
  })

  test('test batch#clear() after write()', function (t) {
    const batch = db.batch().put('foo', 'bar')
    batch.write(function () {})
    try {
      batch.clear()
    } catch (err) {
      t.equal(err.message, 'write() already called on this batch', 'correct error message')
      return t.end()
    }
    t.fail('should have thrown')
    t.end()
  })

  test('test batch#write() after write()', function (t) {
    const batch = db.batch().put('foo', 'bar')
    batch.write(function () {})
    try {
      batch.write(function () {})
    } catch (err) {
      t.equal(err.message, 'write() already called on this batch', 'correct error message')
      return t.end()
    }
    t.fail('should have thrown')
    t.end()
  })

  testCommon.serialize && test('test serialize object', function (t) {
    const batch = db.batch()
    const ops = collectBatchOps(batch)

    batch
      .put({ foo: 'bar' }, { beep: 'boop' })
      .del({ bar: 'baz' })
    ops.forEach(function (op) {
      t.ok(op.key, '.key is set for .put and .del operations')
      if (op.type === 'put') {
        t.ok(op.value, '.value is set for .put operation')
      }
    })
    t.end()
  })

  test('test batch#write() with no operations', function (t) {
    let async = false

    db.batch().write(function (err) {
      t.ifError(err, 'no error from write()')
      t.ok(async, 'callback is asynchronous')
      t.end()
    })

    async = true
  })
}

exports.batch = function (test, testCommon) {
  test('test basic batch', function (t) {
    db.batch([
      { type: 'put', key: 'one', value: '1' },
      { type: 'put', key: 'two', value: '2' },
      { type: 'put', key: 'three', value: '3' }
    ], function (err) {
      t.error(err)

      const batch = db.batch()
        .put('1', 'one')
        .del('2', 'two')
        .put('3', 'three')

      t.is(batch.length, 3, 'length was incremented')

      batch.clear()
      t.is(batch.length, 0, 'length is reset')

      batch.put('one', 'I')
        .put('two', 'II')
        .del('three')
        .put('foo', 'bar')

      t.is(batch.length, 4, 'length was incremented')

      batch.write(function (err) {
        t.error(err)
        collectEntries(
          db.iterator({ keyAsBuffer: false, valueAsBuffer: false }), function (err, data) {
            t.error(err)
            t.equal(data.length, 3, 'correct number of entries')
            const expected = [
              { key: 'foo', value: 'bar' },
              { key: 'one', value: 'I' },
              { key: 'two', value: 'II' }
            ]
            t.deepEqual(data, expected)
            t.end()
          }
        )
      })
    })
  })
}

exports.tearDown = function (test, testCommon) {
  test('tearDown', function (t) {
    db.close(testCommon.tearDown.bind(null, t))
  })
}

exports.all = function (test, testCommon) {
  exports.setUp(test, testCommon)
  exports.args(test, testCommon)
  exports.batch(test, testCommon)
  exports.tearDown(test, testCommon)
}
