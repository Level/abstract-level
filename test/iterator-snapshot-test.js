'use strict'

exports.snapshot = function (test, testCommon) {
  function make (run) {
    return function (t) {
      const db = testCommon.factory()

      db.open(function (err) {
        t.ifError(err, 'no open error')

        db.put('z', 'from snapshot', function (err) {
          t.ifError(err, 'no put error')

          // For this test it is important that we don't read eagerly.
          // NOTE: highWaterMark is not an abstract option atm, but
          // it is supported by leveldown, rocksdb and others.
          const it = db.iterator({ highWaterMark: 0 })

          run(t, db, it, function end (err) {
            t.ifError(err, 'no run error')

            it.end(function (err) {
              t.ifError(err, 'no iterator end error')
              db.close(t.end.bind(t))
            })
          })
        })
      })
    }
  }

  test('delete key after snapshotting', make(function (t, db, it, end) {
    db.del('z', function (err) {
      t.ifError(err, 'no del error')

      it.next(function (err, key, value) {
        t.ifError(err, 'no next error')
        t.ok(key, 'got a key')
        t.is(key.toString(), 'z', 'correct key')
        t.is(value.toString(), 'from snapshot', 'correct value')

        end()
      })
    })
  }))

  test('overwrite key after snapshotting', make(function (t, db, it, end) {
    db.put('z', 'not from snapshot', function (err) {
      t.ifError(err, 'no put error')

      it.next(function (err, key, value) {
        t.ifError(err, 'no next error')
        t.ok(key, 'got a key')
        t.is(key.toString(), 'z', 'correct key')
        t.is(value.toString(), 'from snapshot', 'correct value')

        end()
      })
    })
  }))

  test('add key after snapshotting that sorts first', make(function (t, db, it, end) {
    db.put('a', 'not from snapshot', function (err) {
      t.ifError(err, 'no put error')

      it.next(function (err, key, value) {
        t.ifError(err, 'no next error')

        t.ok(key, 'got a key')
        t.is(key.toString(), 'z', 'correct key')
        t.is(value.toString(), 'from snapshot', 'correct value')

        end()
      })
    })
  }))

  // NOTE: adapted from memdown
  test('delete key after snapshotting, with more entries available', async function (t) {
    const db = testCommon.factory()
    await db.open()
    await Promise.all([db.put('a', 'A'), db.put('b', 'B'), db.put('c', 'C')])

    const iterator = db.iterator({ gte: 'a' })
    t.same(await iterator.next(), ['a', 'A'])

    await db.del('b')
    t.same(await iterator.next(), ['b', 'B'])
    t.same(await iterator.next(), ['c', 'C'])

    await iterator.close()
    return db.close()
  })
}

exports.all = function (test, testCommon) {
  exports.snapshot(test, testCommon)
}
