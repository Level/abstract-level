'use strict'

module.exports = function (test, testCommon, hook) {
  test(`can add and remove functions to/from ${hook} hook`, async function (t) {
    const db = testCommon.factory()
    const fn1 = function () {}
    const fn2 = function () {}

    t.is(db.hooks[hook].noop, true, 'is initially a noop')
    t.is(typeof db.hooks[hook].run, 'function')

    db.hooks[hook].add(fn1)
    t.is(db.hooks[hook].noop, false, 'not a noop')
    t.is(typeof db.hooks[hook].run, 'function')

    db.hooks[hook].add(fn2)
    t.is(db.hooks[hook].noop, false, 'not a noop')
    t.is(typeof db.hooks[hook].run, 'function')

    db.hooks[hook].delete(fn1)
    t.is(db.hooks[hook].noop, false, 'not a noop')
    t.is(typeof db.hooks[hook].run, 'function')

    db.hooks[hook].delete(fn2)
    t.is(db.hooks[hook].noop, true, 'is a noop again')
    t.is(typeof db.hooks[hook].run, 'function')

    for (const invalid of [null, undefined, 123]) {
      t.throws(() => db.hooks[hook].add(invalid), (err) => err.name === 'TypeError')
      t.throws(() => db.hooks[hook].delete(invalid), (err) => err.name === 'TypeError')
    }

    t.is(db.hooks[hook].noop, true, 'still a noop')
    t.is(typeof db.hooks[hook].run, 'function')

    return db.close()
  })
}
