'use strict'

exports.errorIfExists = function (test, testCommon) {
  test('open() with errorIfExists: true', async function (t) {
    t.plan(2)

    const db = testCommon.factory()
    await db.open()
    await db.close()

    try {
      await db.open({ createIfMissing: false, errorIfExists: true })
    } catch (err) {
      t.is(err.code, 'LEVEL_DATABASE_NOT_OPEN')
      t.ok(/exists/.test(err.cause.message), 'error is about already existing')
    }

    // Should be a noop
    return db.close()
  })
}

exports.all = function (test, testCommon) {
  exports.errorIfExists(test, testCommon)
}
