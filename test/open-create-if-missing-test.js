'use strict'

exports.createIfMissing = function (test, testCommon) {
  test('open() with createIfMissing: false', async function (t) {
    t.plan(2)

    const db = testCommon.factory()

    try {
      await db.open({ createIfMissing: false })
    } catch (err) {
      t.is(err.code, 'LEVEL_DATABASE_NOT_OPEN')
      t.ok(/does not exist/.test(err.cause.message), 'error is about dir not existing')
    }

    // Should be a noop
    return db.close()
  })

  test('open() with createIfMissing: false via constructor', async function (t) {
    t.plan(2)

    const db = testCommon.factory({ createIfMissing: false })

    try {
      await db.open()
    } catch (err) {
      t.is(err.code, 'LEVEL_DATABASE_NOT_OPEN')
      t.ok(/does not exist/.test(err.cause.message), 'error is about dir not existing')
    }

    // Should be a noop
    return db.close()
  })
}

exports.all = function (test, testCommon) {
  exports.createIfMissing(test, testCommon)
}
