'use strict'

const concat = require('level-concat-iterator')
const { isSelf } = require('./util')

exports.args = function (test, testCommon) {
  test('test clear() with legacy range options', function (t) {
    t.plan(4)

    const db = testCommon.factory()

    db.open(function (err) {
      t.ifError(err)

      try {
        db.clear({ start: 'foo' }, t.fail.bind(t))
      } catch (err) {
        t.is(err.message, 'Legacy range options ("start" and "end") have been removed')
      }

      try {
        db.clear({ start: 'foo' }).catch(t.fail.bind(t))
      } catch (err) {
        t.is(err.message, 'Legacy range options ("start" and "end") have been removed')
      }

      db.close(t.ifError.bind(t))
    })
  })
}

exports.clear = function (test, testCommon) {
  makeTest('string', ['a', 'b'])

  if (testCommon.supports.bufferKeys) {
    makeTest('buffer', [Buffer.from('a'), Buffer.from('b')])
    makeTest('mixed', [Buffer.from('a'), 'b'])

    // These keys would be equal when compared as utf8 strings
    makeTest('non-utf8 buffer', [Buffer.from('80', 'hex'), Buffer.from('c0', 'hex')])
  }

  function makeTest (type, keys) {
    test('test simple clear() on ' + type + ' keys', function (t) {
      t.plan(8)

      const db = testCommon.factory()
      const ops = keys.map(function (key) {
        return { type: 'put', key: key, value: 'foo' }
      })

      db.open(function (err) {
        t.ifError(err, 'no open error')

        db.batch(ops, function (err) {
          t.ifError(err, 'no batch error')

          concat(db.iterator(), function (err, entries) {
            t.ifError(err, 'no concat error')
            t.is(entries.length, keys.length, 'has entries')

            db.clear(function (err) {
              t.ifError(err, 'no clear error')

              concat(db.iterator(), function (err, entries) {
                t.ifError(err, 'no concat error')
                t.is(entries.length, 0, 'has no entries')

                db.close(function (err) {
                  t.ifError(err, 'no close error')
                })
              })
            })
          })
        })
      })
    })

    test('test simple clear() on ' + type + ' keys, with promise', function (t) {
      t.plan(8)

      const db = testCommon.factory()
      const ops = keys.map(function (key) {
        return { type: 'put', key: key, value: 'foo' }
      })

      db.open(function (err) {
        t.ifError(err, 'no open error')

        db.batch(ops, function (err) {
          t.ifError(err, 'no batch error')

          concat(db.iterator(), function (err, entries) {
            t.ifError(err, 'no concat error')
            t.is(entries.length, keys.length, 'has entries')

            db.clear().then(function () {
              t.ifError(err, 'no clear error')

              concat(db.iterator(), function (err, entries) {
                t.ifError(err, 'no concat error')
                t.is(entries.length, 0, 'has no entries')

                db.close(function (err) {
                  t.ifError(err, 'no close error')
                })
              })
            }).catch(t.fail.bind(t))
          })
        })
      })
    })
  }
}

exports.events = function (test, testCommon) {
  test('test clear() with options emits clear event', async function (t) {
    t.plan(2)

    const db = testCommon.factory()
    await db.open()

    t.ok(db.supports.events.clear)

    if (isSelf(db)) {
      db._serializeKey = (x) => x.toUpperCase()
      db._serializeValue = (x) => x.toUpperCase()
    }

    db.on('clear', function (options) {
      t.same(options, { gt: 'x', custom: 123 })
    })

    await db.clear({ gt: 'x', custom: 123 })
    await db.close()
  })

  test('test clear() without options emits clear event', async function (t) {
    t.plan(2)

    const db = testCommon.factory()
    await db.open()

    t.ok(db.supports.events.clear)

    if (isSelf(db)) {
      db._serializeKey = (x) => x.toUpperCase()
      db._serializeValue = (x) => x.toUpperCase()
    }

    db.on('clear', function (options) {
      t.same(options, {})
    })

    await db.clear()
    await db.close()
  })

  test('test close() on clear event', async function (t) {
    t.plan(1)

    const db = testCommon.factory()
    await db.open()

    db.on('clear', function () {
      db.close(t.ifError.bind(t))
    })

    await db.clear()
  })
}

exports.all = function (test, testCommon) {
  exports.args(test, testCommon)
  exports.events(test, testCommon)
  exports.clear(test, testCommon)
}
