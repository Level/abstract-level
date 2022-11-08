'use strict'

exports.noSnapshot = function (test, testCommon) {
  const make = (run) => async function (t) {
    const db = testCommon.factory()
    const operations = [
      { type: 'put', key: 'a', value: 'a' },
      { type: 'put', key: 'b', value: 'b' },
      { type: 'put', key: 'c', value: 'c' }
    ]

    await db.open()
    await db.batch(operations)

    // For this test it is important that we don't read eagerly.
    // NOTE: highWaterMarkBytes is not an abstract option, but
    // it is supported by classic-level and others. Also set the
    // old & equivalent leveldown highWaterMark option for compat.
    const it = db.iterator({ highWaterMarkBytes: 0, highWaterMark: 0 })

    await run(db)
    await verify(t, it, db)

    return db.close()
  }

  async function verify (t, it, db) {
    const entries = await it.all()
    const kv = entries.map(([key, value]) => key + value)

    if (kv.length === 3) {
      t.same(kv, ['aa', 'bb', 'cc'], 'maybe supports snapshots')
    } else {
      t.same(kv, ['aa', 'cc'], 'ignores keys that have been deleted in the mean time')
    }
  }

  test('delete key after creating iterator', make(async function (db) {
    return db.del('b')
  }))

  test('batch delete key after creating iterator', make(async function (db) {
    return db.batch([{ type: 'del', key: 'b' }])
  }))
}

exports.all = function (test, testCommon) {
  exports.noSnapshot(test, testCommon)
}
