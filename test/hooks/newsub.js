'use strict'

const shared = require('./shared')

module.exports = function (test, testCommon) {
  shared(test, testCommon, 'newsub')

  test('newsub hook function receives sublevel and default options', async function (t) {
    t.plan(3)

    const db = testCommon.factory()

    let instance
    db.hooks.newsub.add(function (sublevel, options) {
      instance = sublevel

      // Recursing is the main purpose of this hook
      t.ok(sublevel.hooks, 'can access sublevel hooks')
      t.same(options, { separator: '!' })
    })

    t.ok(db.sublevel('sub') === instance)
    return db.close()
  })

  test('newsub hook function receives userland options', async function (t) {
    t.plan(1)

    const db = testCommon.factory()

    db.hooks.newsub.add(function (sublevel, options) {
      t.same(options, { separator: '!', userland: 123 })
    })

    db.sublevel('sub', { userland: 123 })
    return db.close()
  })

  test('db wraps error from newsub hook function', async function (t) {
    t.plan(2)

    const db = testCommon.factory()

    db.hooks.newsub.add(function (sublevel, options) {
      throw new Error('test')
    })

    try {
      db.sublevel('sub')
    } catch (err) {
      t.is(err.code, 'LEVEL_HOOK_ERROR')
      t.is(err.cause.message, 'test')
    }

    return db.close()
  })
}
