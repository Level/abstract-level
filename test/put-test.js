var db
var isTypedArray = require('./util').isTypedArray

module.exports.setUp = function (test, testCommon) {
  test('setUp common', testCommon.setUp)
  test('setUp db', function (t) {
    db = testCommon.factory()
    db.open(t.end.bind(t))
  })
}

module.exports.args = function (test, testCommon) {
  test('test argument-less put() throws', function (t) {
    t.throws(
      db.put.bind(db)
      , { name: 'Error', message: 'put() requires a callback argument' }
      , 'no-arg put() throws'
    )
    t.end()
  })

  test('test callback-less, 1-arg, put() throws', function (t) {
    t.throws(
      db.put.bind(db, 'foo')
      , { name: 'Error', message: 'put() requires a callback argument' }
      , 'callback-less, 1-arg put() throws'
    )
    t.end()
  })

  test('test callback-less, 2-arg, put() throws', function (t) {
    t.throws(
      db.put.bind(db, 'foo', 'bar')
      , { name: 'Error', message: 'put() requires a callback argument' }
      , 'callback-less, 2-arg put() throws'
    )
    t.end()
  })

  test('test callback-less, 3-arg, put() throws', function (t) {
    t.throws(
      db.put.bind(db, 'foo', 'bar', {})
      , { name: 'Error', message: 'put() requires a callback argument' }
      , 'callback-less, 3-arg put() throws'
    )
    t.end()
  })

  test('test _serialize object', function (t) {
    t.plan(3)
    var db = testCommon.factory()
    db._put = function (key, value, opts, callback) {
      t.ok(key)
      t.ok(value)
      process.nextTick(callback)
    }
    db.put({}, {}, function (err, val) {
      t.error(err)
    })
  })

  test('test custom _serialize*', function (t) {
    t.plan(4)
    var db = testCommon.factory()
    db._serializeKey = db._serializeValue = function (data) { return data }
    db._put = function (key, value, options, callback) {
      t.deepEqual(key, { foo: 'bar' })
      t.deepEqual(value, { beep: 'boop' })
      process.nextTick(callback)
    }
    db.open(function () {
      db.put({ foo: 'bar' }, { beep: 'boop' }, function (err) {
        t.error(err)
        db.close(t.error.bind(t))
      })
    })
  })
}

module.exports.put = function (test, testCommon) {
  test('test simple put()', function (t) {
    db.put('foo', 'bar', function (err) {
      t.error(err)
      db.get('foo', function (err, value) {
        t.error(err)
        var result = value.toString()
        if (isTypedArray(value)) {
          result = String.fromCharCode.apply(null, new Uint16Array(value))
        }
        t.equal(result, 'bar')
        t.end()
      })
    })
  })
}

module.exports.sync = function (test, testCommon) {
  test('sync put', function (t) {
    db.put('foo', 'bar', { sync: true }, function (err) {
      t.error(err)
      db.get('foo', function (err, value) {
        t.error(err)
        t.equal(value.toString(), 'bar')
        t.end()
      })
    })
  })
  test('sync put just before close', function (t) {
    t.plan(2)
    db.put('foo', 'bar', { sync: true }, function (err) {
      t.error(err)
    })
    db.close(function (err) {
      t.error(err)
    })
  })
}

module.exports.tearDown = function (test, testCommon) {
  test('tearDown', function (t) {
    db.close(testCommon.tearDown.bind(null, t))
  })
}

module.exports.all = function (test, testCommon) {
  testCommon = testCommon || require('./common')
  module.exports.setUp(test, testCommon)
  module.exports.args(test, testCommon)
  module.exports.put(test, testCommon)
  module.exports.tearDown(test, testCommon)
}