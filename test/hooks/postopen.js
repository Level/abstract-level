'use strict'

const shared = require('./shared')

module.exports = function (test, testCommon) {
  shared(test, testCommon, 'postopen')

  test('postopen hook function is called before deferred operations and open event', async function (t) {
    t.plan(5)

    const db = testCommon.factory()
    const order = []

    db.hooks.postopen.add(async function (options) {
      t.is(db.status, 'open')
      order.push('postopen')
    })

    db.on('opening', function () {
      t.is(db.status, 'opening')
      order.push('opening')
    })

    db.defer(function () {
      t.is(db.status, 'open')
      order.push('undefer')
    })

    db.on('open', function () {
      t.is(db.status, 'open')
      order.push('open')
    })

    await db.open()
    t.same(order, ['opening', 'postopen', 'undefer', 'open'])

    return db.close()
  })

  test('postopen hook functions are called sequentially', async function (t) {
    t.plan(1)

    const db = testCommon.factory()

    let waited = false
    db.hooks.postopen.add(async function (options) {
      return new Promise(function (resolve) {
        setTimeout(function () {
          waited = true
          resolve()
        }, 100)
      })
    })

    db.hooks.postopen.add(async function (options) {
      t.ok(waited)
    })

    await db.open()
    return db.close()
  })

  test('postopen hook function receives options from constructor', async function (t) {
    t.plan(1)

    const db = testCommon.factory({ userland: 123 })

    db.hooks.postopen.add(async function (options) {
      t.same(options, {
        createIfMissing: true,
        errorIfExists: false,
        userland: 123
      })
    })

    await db.open()
    return db.close()
  })

  test('postopen hook function receives options from open()', async function (t) {
    t.plan(1)

    const db = testCommon.factory()

    db.hooks.postopen.add(async function (options) {
      t.same(options, {
        createIfMissing: true,
        errorIfExists: false,
        userland: 456
      })
    })

    await db.open({ userland: 456 })
    return db.close()
  })

  test('error from postopen hook function closes the db', async function (t) {
    t.plan(4)

    const db = testCommon.factory()

    db.hooks.postopen.add(async function (options) {
      t.is(db.status, 'open')
      throw new Error('test')
    })

    try {
      await db.open()
    } catch (err) {
      t.is(db.status, 'closed')
      t.is(err.code, 'LEVEL_HOOK_ERROR')
      t.is(err.cause.message, 'test')
    }
  })

  test('postopen hook function that fully closes the db results in error', async function (t) {
    t.plan(5)

    const db = testCommon.factory()

    db.hooks.postopen.add(async function (options) {
      t.is(db.status, 'open')
      return db.close()
    })

    db.on('open', function () {
      t.fail('should not open')
    })

    db.on('closed', function () {
      t.pass('closed')
    })

    try {
      await db.open()
    } catch (err) {
      t.is(db.status, 'closed')
      t.is(err.code, 'LEVEL_HOOK_ERROR')
      t.is(err.message, 'The postopen hook has closed the database')
    }
  })

  test('postopen hook function that partially closes the db results in error', async function (t) {
    t.plan(5)

    const db = testCommon.factory()

    db.hooks.postopen.add(async function (options) {
      t.is(db.status, 'open')
      db.close() // Don't await
    })

    db.on('open', function () {
      t.fail('should not open')
    })

    db.on('closed', function () {
      t.pass('closed')
    })

    try {
      await db.open()
    } catch (err) {
      t.is(db.status, 'closed')
      t.is(err.code, 'LEVEL_HOOK_ERROR')
      t.is(err.message, 'The postopen hook has closed the database')
    }
  })
}
