'use strict'

module.exports = function (test, testCommon) {
  test('testCommon.factory() returns valid database', function (t) {
    t.plan(6)

    const db = testCommon.factory()
    const kEvent = Symbol('event')

    // Avoid instanceof, for levelup compatibility tests
    t.is(typeof db, 'object', 'is an object')
    t.isNot(db, null, 'is not null')
    t.is(typeof db.open, 'function', 'has open() method')
    t.is(typeof db.on, 'function', 'has on() method')
    t.is(typeof db.emit, 'function', 'has emit() method')

    db.once(kEvent, (v) => t.is(v, 'foo', 'got event'))
    db.emit(kEvent, 'foo')
  })

  test('testCommon.factory() returns a unique database', async function (t) {
    const db1 = testCommon.factory()
    const db2 = testCommon.factory()

    t.isNot(db1, db2, 'unique instances')

    await db1.open()
    await db2.open()
    await db1.put('key', 'value')

    const value = await db2.get('key')
    t.is(value, undefined, 'db2 should be empty')

    return Promise.all([db1.close(), db2.close()])
  })
}
