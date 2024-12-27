'use strict'

module.exports = function (name, testCommon, options, run) {
  if (typeof options === 'function') {
    run = options
    options = {}
  }

  const test = testCommon.test
  const deferred = options.deferred !== false

  test(`${name} on open db`, async function (t) {
    const db = testCommon.factory()

    await db.open()
    t.is(db.status, 'open')

    await run(t, db)
    t.is(db.status, 'open')

    return db.close()
  })

  deferred && test(`${name} on opening db`, async function (t) {
    const db = testCommon.factory()
    t.is(db.status, 'opening')
    await run(t, db)
    t.is(db.status, 'open')
    return db.close()
  })

  test(`${name} on reopened db`, async function (t) {
    const db = testCommon.factory()

    await db.close()
    t.is(db.status, 'closed')

    await db.open()
    t.is(db.status, 'open')

    await run(t, db)
    t.is(db.status, 'open')

    return db.close()
  })

  deferred && test(`${name} on reopening db`, async function (t) {
    const db = testCommon.factory()

    await db.close()
    t.is(db.status, 'closed')

    const promise = db.open()
    t.is(db.status, 'opening')

    await run(t, db)
    t.is(db.status, 'open')

    await promise
    return db.close()
  })
}
