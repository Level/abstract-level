'use strict'

const test = require('tape')
const { AbstractLevel, AbstractIterator, AbstractKeyIterator, AbstractValueIterator } = require('../..')

const testCommon = require('../common')({
  test,
  factory: function () {
    return new AbstractLevel({ encodings: { utf8: true } })
  }
})

for (const Ctor of [AbstractIterator, AbstractKeyIterator, AbstractValueIterator]) {
  // Note, these tests don't create fully functional iterators, because they're not
  // created via db.iterator() and therefore lack the options necessary to decode data.
  // Not relevant for these tests.

  test(`test ${Ctor.name} extensibility`, function (t) {
    const Test = class TestIterator extends Ctor {}
    const db = testCommon.factory()
    const test = new Test(db, {})
    t.ok(test.db === db, 'instance has db reference')
    t.end()
  })

  test(`${Ctor.name} throws on invalid db argument`, function (t) {
    t.plan(4 * 2)

    for (const args of [[], [null], [undefined], 'foo']) {
      const hint = args[0] === null ? 'null' : typeof args[0]

      try {
        // eslint-disable-next-line no-new
        new Ctor(...args)
      } catch (err) {
        t.is(err.name, 'TypeError')
        t.is(err.message, 'The first argument must be an abstract-level database, received ' + hint)
      }
    }
  })

  test(`${Ctor.name} throws on invalid options argument`, function (t) {
    t.plan(4 * 2)

    for (const args of [[], [null], [undefined], 'foo']) {
      try {
        // eslint-disable-next-line no-new
        new Ctor({}, ...args)
      } catch (err) {
        t.is(err.name, 'TypeError')
        t.is(err.message, 'The second argument must be an options object')
      }
    }
  })

  test(`${Ctor.name}.next() extensibility`, async function (t) {
    t.plan(2)

    class TestIterator extends Ctor {
      async _next () {
        t.is(this, it, 'thisArg on _next() was correct')
        t.is(arguments.length, 0, 'got 0 arguments')
      }
    }

    const db = testCommon.factory()
    await db.open()
    const it = new TestIterator(db, {})
    await it.next()
    await db.close()
  })

  test(`${Ctor.name}.nextv() extensibility`, async function (t) {
    t.plan(4)

    class TestIterator extends Ctor {
      async _nextv (size, options) {
        t.is(this, it, 'thisArg on _nextv() was correct')
        t.is(arguments.length, 2, 'got 2 arguments')
        t.is(size, 100)
        t.same(options, {})
        return []
      }
    }

    const db = testCommon.factory()
    await db.open()
    const it = new TestIterator(db, {})
    await it.nextv(100)
    await db.close()
  })

  test(`${Ctor.name}.nextv() extensibility (options)`, async function (t) {
    t.plan(2)

    class TestIterator extends Ctor {
      async _nextv (size, options) {
        t.is(size, 100)
        t.same(options, { foo: 123 }, 'got userland options')
        return []
      }
    }

    const db = testCommon.factory()
    await db.open()
    const it = new TestIterator(db, {})
    await it.nextv(100, { foo: 123 })

    return db.close()
  })

  test(`${Ctor.name}.all() extensibility`, async function (t) {
    t.plan(2 * 3)

    for (const args of [[], [{}]]) {
      class TestIterator extends Ctor {
        async _all (options) {
          t.is(this, it, 'thisArg on _all() was correct')
          t.is(arguments.length, 1, 'got 1 argument')
          t.same(options, {}, '')
          return []
        }
      }

      const db = testCommon.factory()
      await db.open()
      const it = new TestIterator(db, {})
      await it.all(...args)
      await db.close()
    }
  })

  test(`${Ctor.name}.all() extensibility (options)`, async function (t) {
    t.plan(1)

    class TestIterator extends Ctor {
      async _all (options) {
        t.same(options, { foo: 123 }, 'got userland options')
        return []
      }
    }

    const db = testCommon.factory()
    await db.open()
    const it = new TestIterator(db, {})
    await it.all({ foo: 123 })
    await db.close()
  })

  test(`${Ctor.name}.seek() throws if not implemented`, async function (t) {
    t.plan(1)

    const db = testCommon.factory()
    await db.open()
    const it = new Ctor(db, {})

    try {
      it.seek('123')
    } catch (err) {
      t.is(err.code, 'LEVEL_NOT_SUPPORTED')
    }

    return db.close()
  })

  test(`${Ctor.name}.close() extensibility`, async function (t) {
    t.plan(2)

    class TestIterator extends Ctor {
      async _close () {
        t.is(this, it, 'thisArg on _close() was correct')
        t.is(arguments.length, 0, 'got 0 arguments')
      }
    }

    const db = testCommon.factory()
    await db.open()
    const it = new TestIterator(db, {})
    await it.close()
    await db.close()
  })
}
