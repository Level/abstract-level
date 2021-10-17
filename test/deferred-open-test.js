'use strict'

const DeferredIterator = require('../lib/deferred-iterator')

exports.all = function (test, testCommon) {
  function verifyValues (t, db, entries) {
    let pendingGets = 3

    for (let k = 1; k <= entries; k++) {
      db.get('k' + k, { asBuffer: false }, function (err, v) {
        t.ifError(err, 'no get() error')
        t.is(v, 'v' + k, 'value is ok')
        t.is(db.status, 'open', 'status is ok')

        if (--pendingGets <= 0) {
          db.get('k4', { asBuffer: false }, function (err) {
            t.ok(err)
            db.close(t.ifError.bind(t))
          })
        }
      })
    }
  }

  // NOTE: copied from levelup
  test('deferred open(): put() and get() on new database', function (t) {
    t.plan(15)

    // Open database without callback, opens in next tick
    const db = testCommon.factory()

    let pendingPuts = 3

    // Insert 3 values with put(), these should be deferred until the database is actually open
    for (let k = 1; k <= 3; k++) {
      db.put('k' + k, 'v' + k, function (err) {
        t.ifError(err, 'no put() error')

        if (--pendingPuts <= 0) {
          verifyValues(t, db, 3)
        }
      })
    }

    t.is(db.status, 'opening')
  })

  // NOTE: copied from levelup
  test('deferred open(): batch() on new database', function (t) {
    t.plan(13)

    // Open database without callback, opens in next tick
    const db = testCommon.factory()

    // Insert 3 values with batch(), these should be deferred until the database is actually open
    db.batch([
      { type: 'put', key: 'k1', value: 'v1' },
      { type: 'put', key: 'k2', value: 'v2' },
      { type: 'put', key: 'k3', value: 'v3' }
    ], function (err) {
      t.ifError(err, 'no batch() error')
      verifyValues(t, db, 3)
    })

    t.is(db.status, 'opening')
  })

  // NOTE: copied from levelup
  test('deferred open(): chained batch() on new database', function (t) {
    t.plan(13)

    // Open database without callback, opens in next tick
    const db = testCommon.factory()

    // Insert 3 values with batch(), these should be deferred until the database is actually open
    db.batch()
      .put('k1', 'v1')
      .put('k2', 'v2')
      .put('k3', 'v3')
      .write(function (err) {
        t.ifError(err, 'no write() error')
        verifyValues(t, db, 3)
      })

    t.is(db.status, 'opening')
  })

  // NOTE: copied from levelup
  test('deferred open(): put() and get() on reopened database', async function (t) {
    const db = testCommon.factory()

    await db.close()
    t.is(db.status, 'closed')

    db.open(() => {})
    t.is(db.status, 'opening')

    await db.put('beep', 'boop')

    t.is(db.status, 'open')
    t.is(await db.get('beep', { asBuffer: false }), 'boop')

    await db.close()
  })

  // NOTE: copied from levelup
  // TODO: replace with iterator test
  // testCommon.streams && test('deferred open(): test deferred ReadStream', function (t) {
  //   const ctx = readStreamContext(t)
  //   const db = testCommon.factory()
  //
  //   db.batch(ctx.sourceData.slice(), function (err) {
  //     t.ifError(err)
  //     db.close(function (err) {
  //       t.ifError(err, 'no error')
  //       let async = true
  //
  //       db.open(function (err) {
  //         async = false
  //         t.ifError(err, 'no open error')
  //       })
  //
  //       createReadStream(db)
  //         .on('data', ctx.dataSpy)
  //         .on('end', ctx.endSpy)
  //         .on('close', function () {
  //           ctx.verify()
  //           db.close(t.end.bind(t))
  //         })
  //
  //       // db should open lazily
  //       t.ok(async)
  //     })
  //   })
  // })

  // NOTE: copied from levelup
  // Not relevant for abstract-leveldown by itself
  testCommon.supports.encodings && test('deferred open(): value of queued operation is not serialized', function (t) {
    t.plan(4)

    const db = testCommon.factory({ valueEncoding: 'json' })

    db.put('key', { thing: 2 }, function (err) {
      t.ifError(err)

      db.get('key', function (err, value) {
        t.ifError(err)
        t.same(value, { thing: 2 })
        db.close(t.ifError.bind(t))
      })
    })
  })

  // NOTE: copied from levelup
  // Not relevant for abstract-leveldown by itself
  testCommon.supports.encodings && test('deferred open(): key of queued operation is not serialized', function (t) {
    t.plan(4)

    const db = testCommon.factory({ keyEncoding: 'json' })

    db.put({ thing: 2 }, 'value', function (err) {
      t.ifError(err)

      db.iterator().next(function (err, key, value) {
        t.ifError(err, 'no next() error')
        t.same(key, { thing: 2 })
        db.close(t.ifError.bind(t))
      })
    })
  })

  // NOTE: copied from deferred-leveldown
  test('cannot operate on closed db', function (t) {
    t.plan(4)

    const db = testCommon.factory()

    db.open(function (err) {
      t.ifError(err)

      db.close(function (err) {
        t.ifError(err)

        db.put('foo', 'bar', function (err) {
          t.is(err && err.message, 'Database is not open')
        })

        try {
          db.iterator()
        } catch (err) {
          t.is(err.message, 'Database is not open')
        }
      })
    })
  })

  // NOTE: copied from deferred-leveldown
  test('cannot operate on closing db', function (t) {
    t.plan(4)

    const db = testCommon.factory()

    db.open(function (err) {
      t.ifError(err)

      db.close(function (err) {
        t.ifError(err)
      })

      db.put('foo', 'bar', function (err) {
        t.is(err && err.message, 'Database is not open')
      })

      try {
        db.iterator()
      } catch (err) {
        t.is(err.message, 'Database is not open')
      }
    })
  })

  // NOTE: copied from deferred-leveldown
  test('deferred iterator - cannot operate on closed db', function (t) {
    t.plan(7)

    const db = testCommon.factory()

    db.open(function (err) {
      t.error(err, 'no error')

      db.close(function (err) {
        t.ifError(err)

        it.next(function (err, key, value) {
          t.is(err && err.message, 'Iterator is not open')
        })

        it.next().catch(function (err) {
          t.is(err.message, 'Iterator is not open')
        })

        // Was already closed
        it.close(function () {
          t.ifError(err, 'no close() error')
        })

        it.close().catch(function () {
          t.fail('no close() error')
        })

        try {
          it.seek('foo')
        } catch (err) {
          t.is(err.message, 'Iterator is not open')
        }
      })
    })

    const it = db.iterator({ gt: 'foo' })
    t.ok(it instanceof DeferredIterator)
  })

  // NOTE: copied from deferred-leveldown
  test('deferred iterator - cannot operate on closing db', function (t) {
    t.plan(7)

    const db = testCommon.factory()

    db.open(function (err) {
      t.error(err, 'no error')

      db.close(function (err) {
        t.ifError(err)
      })

      it.next(function (err, key, value) {
        t.is(err && err.message, 'Iterator is not open')
      })

      it.next().catch(function (err) {
        t.is(err.message, 'Iterator is not open')
      })

      // Is already closing
      it.close(function (err) {
        t.ifError(err, 'no close() error')
      })

      it.close().catch(function () {
        t.fail('no close() error')
      })

      try {
        it.seek('foo')
      } catch (err) {
        t.is(err.message, 'Iterator is not open')
      }
    })

    const it = db.iterator({ gt: 'foo' })
    t.ok(it instanceof DeferredIterator)
  })
}
