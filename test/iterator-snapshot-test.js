'use strict'

exports.snapshot = function (test, testCommon) {
  const make = (run) => async function (t) {
    const db = testCommon.factory()
    await db.open()
    await db.put('z', 'from snapshot')

    // For this test it is important that we don't read eagerly.
    // NOTE: highWaterMarkBytes is not an abstract option, but
    // it is supported by classic-level and others. Also set the
    // old & equivalent leveldown highWaterMark option for compat.
    const it = db.iterator({ highWaterMarkBytes: 0, highWaterMark: 0 })

    await run(t, db, it)
    await it.close()

    return db.close()
  }

  test('delete key after snapshotting', make(async function (t, db, it) {
    await db.del('z')
    t.same(await it.next(), ['z', 'from snapshot'], 'correct entry')
  }))

  test('overwrite key after snapshotting', make(async function (t, db, it) {
    await db.put('z', 'not from snapshot')
    t.same(await it.next(), ['z', 'from snapshot'], 'correct entry')
  }))

  test('add key after snapshotting that sorts first', make(async function (t, db, it) {
    await db.put('a', 'not from snapshot')
    t.same(await it.next(), ['z', 'from snapshot'], 'correct entry')
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
