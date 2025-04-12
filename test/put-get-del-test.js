'use strict'

const { Buffer } = require('buffer')

let db

function makeTest (test, type, key, value, expectedValue) {
  const stringValue = arguments.length === 5 ? expectedValue : value.toString()

  test('put(), get(), del() with ' + type, async function (t) {
    await db.put(key, value)

    t.is((await db.get(key)).toString(), stringValue)

    if (db.supports.getSync) {
      t.is(db.getSync(key).toString(), stringValue)
    }

    await db.del(key)

    t.is(await db.get(key), undefined, 'not found')

    if (db.supports.getSync) {
      t.is(db.getSync(key), undefined, 'not found')
    }
  })
}

exports.setUp = function (test, testCommon) {
  test('put(), get(), del() setup', async function (t) {
    db = testCommon.factory()
    return db.open()
  })
}

exports.nonErrorKeys = function (test, testCommon) {
  // valid falsey keys
  makeTest(test, '`0` key', 0, 'foo 0')
  makeTest(test, 'empty string key', 0, 'foo')

  // standard String key
  makeTest(
    test
    , 'long String key'
    , 'some long string that I\'m using as a key for this unit test, cross your fingers human, we\'re going in!'
    , 'foo'
  )

  if (testCommon.supports.encodings.buffer) {
    makeTest(test, 'Buffer key', Buffer.from('0080c0ff', 'hex'), 'foo')
    makeTest(test, 'empty Buffer key', Buffer.alloc(0), 'foo')
  }

  // non-empty Array as a value
  makeTest(test, 'Array value', 'foo', [1, 2, 3, 4])
}

exports.nonErrorValues = function (test, testCommon) {
  // valid falsey values
  makeTest(test, '`false` value', 'foo false', false)
  makeTest(test, '`0` value', 'foo 0', 0)
  makeTest(test, '`NaN` value', 'foo NaN', NaN)

  // all of the following result in an empty-string value:
  makeTest(test, 'empty String value', 'foo', '', '')
  makeTest(test, 'empty Buffer value', 'foo', Buffer.alloc(0), '')
  makeTest(test, 'empty Array value', 'foo', [], '')

  // String value
  makeTest(
    test
    , 'long String value'
    , 'foo'
    , 'some long string that I\'m using as a key for this unit test, cross your fingers human, we\'re going in!'
  )

  // Buffer value
  if (testCommon.supports.encodings.buffer) {
    makeTest(test, 'Buffer value', 'foo', Buffer.from('0080c0ff', 'hex'))
  }

  // non-empty Array as a key
  makeTest(test, 'Array key', [1, 2, 3, 4], 'foo')
}

exports.tearDown = function (test, testCommon) {
  test('put(), get(), del() teardown', async function (t) {
    return db.close()
  })
}

exports.all = function (test, testCommon) {
  exports.setUp(test, testCommon)
  exports.nonErrorKeys(test, testCommon)
  exports.nonErrorValues(test, testCommon)
  exports.tearDown(test, testCommon)
}
