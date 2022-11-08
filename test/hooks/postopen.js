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

  test('error from postopen hook function must be an error', async function (t) {
    t.plan(5)

    const db = testCommon.factory()

    db.hooks.postopen.add(async function (options) {
      t.is(db.status, 'open')
      // eslint-disable-next-line prefer-promise-reject-errors
      return Promise.reject(null)
    })

    try {
      await db.open()
    } catch (err) {
      t.is(db.status, 'closed')
      t.is(err.code, 'LEVEL_HOOK_ERROR')
      t.is(err.cause.name, 'TypeError')
      t.is(err.cause.message, 'Promise rejection reason must be an Error, received null')
    }
  })

  test('error from postopen hook function must be an error, but it can be cross-realm', async function (t) {
    t.plan(5)

    class FakeError {
      get [Symbol.toStringTag] () {
        return 'Error'
      }
    }

    const fake = new FakeError()
    const db = testCommon.factory()

    t.is(Object.prototype.toString.call(fake), '[object Error]')

    db.hooks.postopen.add(async function (options) {
      t.is(db.status, 'open')
      return Promise.reject(fake)
    })

    try {
      await db.open()
    } catch (err) {
      t.is(db.status, 'closed')
      t.is(err.code, 'LEVEL_HOOK_ERROR')
      t.is(err.cause, fake)
    }
  })

  test('errors from both postopen hook function and resource lock the db', async function (t) {
    t.plan(9)

    const db = testCommon.factory()
    const resource = db.iterator()

    resource.close = async function () {
      throw new Error('error from resource')
    }

    db.hooks.postopen.add(async function (options) {
      t.is(db.status, 'open')
      throw new Error('error from hook')
    })

    try {
      await db.open()
    } catch (err) {
      t.is(db.status, 'closed')
      t.is(err.code, 'LEVEL_HOOK_ERROR')
      t.is(err.cause.name, 'CombinedError')
      t.is(err.cause.message, 'error from hook; error from resource')
    }

    try {
      await db.open()
    } catch (err) {
      t.is(db.status, 'closed')
      t.is(err.code, 'LEVEL_STATUS_LOCKED')
    }

    try {
      await db.close()
    } catch (err) {
      t.is(db.status, 'closed')
      t.is(err.code, 'LEVEL_STATUS_LOCKED')
    }
  })

  for (const method of ['open', 'close']) {
    test(`postopen hook function that attempts to call ${method}() results in error`, async function (t) {
      t.plan(5)

      const db = testCommon.factory()

      db.hooks.postopen.add(async function (options) {
        t.is(db.status, 'open')
        return db[method]()
      })

      db.on('open', function () {
        t.fail('should not open')
      })

      try {
        await db.open()
      } catch (err) {
        t.is(db.status, 'closed')
        t.is(err.code, 'LEVEL_HOOK_ERROR')
        t.is(err.cause.code, 'LEVEL_STATUS_LOCKED')
        t.is(err.cause.message, 'Database status is locked')
      }
    })
  }
}
