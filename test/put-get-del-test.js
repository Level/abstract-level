'use strict'

const verifyNotFoundError = require('./util').verifyNotFoundError
const testBuffer = Buffer.from('testbuffer')

let db

function makePutGetDelSuccessfulTest (test, testCommon, type, key, value, expectedResult) {
  const hasExpectedResult = arguments.length === 6
  test('test put()/get()/del() with ' + type, function (t) {
    db.put(key, value, function (err) {
      t.error(err)
      db.get(key, function (err, _value) {
        t.error(err, 'no error, has key/value for `' + type + '`')

        let result

        if (!db.supports.encodings) {
          t.ok(Buffer.isBuffer(_value), 'is a Buffer')
          result = _value
        } else {
          t.is(typeof _value, 'string', 'is a string')
          result = _value
        }

        if (hasExpectedResult) {
          t.equal(result.toString(), expectedResult)
        } else {
          if (result != null) { result = _value.toString() }
          if (value != null) { value = value.toString() }
          t.equals(result, value)
        }
        db.del(key, function (err) {
          t.error(err, 'no error, deleted key/value for `' + type + '`')

          let async = false

          db.get(key, function (err, value) {
            t.ok(err, 'entry properly deleted')
            t.ok(verifyNotFoundError(err), 'should have correct error message')
            t.equal(typeof value, 'undefined', 'value is undefined')
            t.ok(async, 'callback is asynchronous')
            t.end()
          })

          async = true
        })
      })
    })
  })
}

exports.setUp = function (test, testCommon) {
  test('setUp db', function (t) {
    db = testCommon.factory()
    db.open(t.end.bind(t))
  })
}

exports.nonErrorKeys = function (test, testCommon) {
  // valid falsey keys
  makePutGetDelSuccessfulTest(test, testCommon, '`0` key', 0, 'foo 0')

  // standard String key
  makePutGetDelSuccessfulTest(
    test
    , testCommon
    , 'long String key'
    , 'some long string that I\'m using as a key for this unit test, cross your fingers human, we\'re going in!'
    , 'foo'
  )

  if (testCommon.supports.bufferKeys) {
    makePutGetDelSuccessfulTest(test, testCommon, 'Buffer key', testBuffer, 'foo')
  }

  // non-empty Array as a value
  makePutGetDelSuccessfulTest(test, testCommon, 'Array value', 'foo', [1, 2, 3, 4])
}

exports.nonErrorValues = function (test, testCommon) {
  // valid falsey values
  makePutGetDelSuccessfulTest(test, testCommon, '`false` value', 'foo false', false)
  makePutGetDelSuccessfulTest(test, testCommon, '`0` value', 'foo 0', 0)
  makePutGetDelSuccessfulTest(test, testCommon, '`NaN` value', 'foo NaN', NaN)

  // all of the following result in an empty-string value:
  makePutGetDelSuccessfulTest(test, testCommon, 'empty String value', 'foo', '', '')
  makePutGetDelSuccessfulTest(test, testCommon, 'empty Buffer value', 'foo', Buffer.alloc(0), '')

  // note that an implementation may return the value as an array
  makePutGetDelSuccessfulTest(test, testCommon, 'empty Array value', 'foo', [], '')

  // standard String value
  makePutGetDelSuccessfulTest(
    test
    , testCommon
    , 'long String value'
    , 'foo'
    , 'some long string that I\'m using as a key for this unit test, cross your fingers human, we\'re going in!'
  )

  // standard Buffer value
  makePutGetDelSuccessfulTest(test, testCommon, 'Buffer value', 'foo', testBuffer)

  // non-empty Array as a key
  makePutGetDelSuccessfulTest(test, testCommon, 'Array key', [1, 2, 3, 4], 'foo')
}

exports.tearDown = function (test, testCommon) {
  test('tearDown', function (t) {
    db.close(t.end.bind(t))
  })
}

exports.all = function (test, testCommon) {
  exports.setUp(test, testCommon)
  exports.nonErrorKeys(test, testCommon)
  exports.nonErrorValues(test, testCommon)
  exports.tearDown(test, testCommon)
}
