'use strict'

exports.open = function (test, testCommon) {
  test('open() and close(), no options', async function (t) {
    const db = testCommon.factory()
    t.is(db.status, 'opening')

    const promise1 = db.open()
    t.is(db.status, 'opening')
    await promise1

    t.is(db.status, 'open')

    const promise2 = db.close()
    t.is(db.status, 'closing')
    await promise2
    t.is(db.status, 'closed')
  })

  test('open() and close(), with empty options', async function (t) {
    const db = testCommon.factory()
    await db.open({})
    return db.close()
  })

  test('open(), close() and open()', async function (t) {
    const db = testCommon.factory()

    await db.open()
    t.is(db.status, 'open')

    await db.close()
    t.is(db.status, 'closed')

    await db.open()
    t.is(db.status, 'open')

    return db.close()
  })

  test('open() and close() in same tick', function (t) {
    t.plan(5)

    const db = testCommon.factory()
    const order = []

    db.open().then(function () {
      order.push('A')
      t.is(db.status, 'open', 'is open')
    })

    t.is(db.status, 'opening', 'is opening')

    // This eventually wins from the open() call
    db.close().then(function () {
      order.push('B')
      t.same(order, ['open event', 'A', 'closed event', 'B'], 'order is correct')
      t.is(db.status, 'closed', 'is closed')
    })

    // But open() is still in progress
    t.is(db.status, 'opening', 'is still opening')

    db.on('open', () => { order.push('open event') })
    db.on('closed', () => { order.push('closed event') })
  })

  test('open(), close() and open() in same tick', function (t) {
    t.plan(8)

    const db = testCommon.factory()
    const order = []

    db.open().then(function () {
      order.push('A')
      t.is(db.status, 'open', 'is open')
    })

    t.is(db.status, 'opening', 'is opening')

    // This wins from the open() call
    db.close().then(function () {
      order.push('B')
      t.is(db.status, 'closed', 'is closed')
    })

    t.is(db.status, 'opening', 'is still opening')

    // This wins from the close() call
    db.open().then(function () {
      order.push('C')
      t.same(order, ['open event', 'A', 'closed event', 'B', 'open event', 'C'], 'callback order is the same as call order')
      t.is(db.status, 'open', 'is open')

      db.close().then(() => t.pass('done'))
    })

    db.on('closed', () => { order.push('closed event') })
    db.on('open', () => { order.push('open event') })

    t.is(db.status, 'opening', 'is still opening')
  })

  test('open() if already open (sequential)', async function (t) {
    t.plan(3)

    const db = testCommon.factory()

    await db.open()
    t.is(db.status, 'open', 'is open')

    const promise = db.open()
    t.is(db.status, 'open', 'not reopening')
    db.on('open', t.fail.bind(t))

    await promise
    t.is(db.status, 'open', 'is open')
    return db.close()
  })

  test('open() if already opening (parallel)', function (t) {
    t.plan(4)

    const db = testCommon.factory()
    let called = false

    db.open().then(function () {
      called = true
      t.is(db.status, 'open')
    })

    db.open().then(function () {
      t.is(db.status, 'open')
      t.ok(called)
      db.close(() => t.pass('done'))
    })

    t.is(db.status, 'opening')
  })

  test('close() if already closed', async function (t) {
    t.plan(3)

    const db = testCommon.factory()

    await db.open()
    await db.close()

    t.is(db.status, 'closed', 'is closed')
    const promise = db.close()
    t.is(db.status, 'closed', 'is closed', 'not reclosing')
    db.on('closed', t.fail.bind(t))
    await promise
    t.is(db.status, 'closed', 'still closed')
  })

  test('close() if new', function (t) {
    t.plan(4)

    const db = testCommon.factory()
    t.is(db.status, 'opening', 'status ok')

    db.close().then(function () {
      t.is(db.status, 'closed', 'status ok')
    })

    // This behaves differently in abstract-level v1: status remains 'opening' because
    // the db let's opening finish (or start, really) and only then closes the db.
    t.is(db.status, 'closing', 'status ok')

    if (!db.supports.deferredOpen) {
      t.pass('skip')
      db.on('closed', t.fail.bind(t, 'should not emit closed'))
    } else {
      db.on('closed', t.pass.bind(t, 'got closed event'))
    }
  })

  for (const event of ['open', 'opening']) {
    test(`close() on ${event} event`, function (t) {
      t.plan(3)

      const db = testCommon.factory()
      const order = []

      db.on(event, function () {
        order.push(`${event} event`)

        // This eventually wins from the in-progress open() call
        db.close().then(function () {
          order.push('B')
          t.same(order, [`${event} event`, 'A', 'closed event', 'B'], 'order is correct')
          t.is(db.status, 'closed', 'is closed')
        }, t.fail.bind(t))
      })

      db.open().then(function () {
        order.push('A')
        t.is(db.status, 'open', 'is open')
      }, t.fail.bind(t))

      db.on('closed', () => { order.push('closed event') })
    })
  }

  for (const event of ['closed', 'closing']) {
    test(`open() on ${event} event`, function (t) {
      t.plan(3)

      const db = testCommon.factory()
      const order = []

      db.on(event, function () {
        order.push(`${event} event`)

        // This eventually wins from the in-progress close() call
        db.open().then(function () {
          order.push('B')
          t.same(order, [`${event} event`, 'A', 'open event', 'B'], 'order is correct')
          t.is(db.status, 'open', 'is open')
        }, t.fail.bind(t))
      })

      db.close().then(function () {
        order.push('A')
        t.is(db.status, 'closed', 'is closed')
      }, t.fail.bind(t))

      db.on('open', () => { order.push('open event') })
    })
  }

  test('passive open()', async function (t) {
    t.plan(1)
    const db = testCommon.factory()
    await db.open({ passive: true }) // OK, already opening
    await db.close()
    await db.open({ passive: true }).catch(err => {
      t.is(err.code, 'LEVEL_DATABASE_NOT_OPEN')
    })
    await db.open()
    await db.open({ passive: true }) // OK, already open
    return db.close()
  })

  test('passive option is ignored if set in constructor options', async function (t) {
    const db = testCommon.factory({ passive: true })
    await new Promise((resolve) => db.once('open', resolve))
    return db.close()
  })

  // Can't use the syntax yet (https://github.com/tc39/proposal-explicit-resource-management)
  Symbol.asyncDispose && test('Symbol.asyncDispose', async function (t) {
    const db = testCommon.factory()
    await db.open()
    await db[Symbol.asyncDispose]()
    t.is(db.status, 'closed')
  })
}

exports.all = function (test, testCommon) {
  exports.open(test, testCommon)
}
