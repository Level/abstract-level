'use strict'

module.exports = function (name, testCommon, run) {
  const test = testCommon.test

  for (const deferred of [false, true]) {
    test(`${name} on closed db fails (deferred open: ${deferred})`, async function (t) {
      let error

      const db = testCommon.factory()
      if (!deferred) await db.open()

      await db.close()

      try {
        await run(t, db)
      } catch (err) {
        error = err
      }

      t.is(error && error.code, 'LEVEL_DATABASE_NOT_OPEN')
    })

    test(`${name} on closing db fails (deferred open: ${deferred})`, async function (t) {
      let error

      const db = testCommon.factory()
      if (!deferred) await db.open()

      const promise = db.close()

      try {
        await run(t, db)
      } catch (err) {
        error = err
      }

      await promise
      t.is(error && error.code, 'LEVEL_DATABASE_NOT_OPEN')
    })
  }
}
