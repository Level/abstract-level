'use strict'

const input = [{ key: '1', value: '1' }, { key: '2', value: '2' }]

let db

exports.setup = function (test, testCommon) {
  test('setup', function (t) {
    t.plan(2)

    db = testCommon.factory()
    db.open(function (err) {
      t.ifError(err, 'no open() error')

      db.batch(input.map(entry => ({ ...entry, type: 'put' })), function (err) {
        t.ifError(err, 'no batch() error')
      })
    })
  })
}

exports.asyncIterator = function (test, testCommon) {
  test('for await...of db.iterator()', async function (t) {
    t.plan(1)

    const it = db.iterator({ keyEncoding: 'utf8', valueEncoding: 'utf8' })
    const output = []

    for await (const [key, value] of it) {
      output.push({ key, value })
    }

    t.same(output, input)
  })

  testCommon.supports.permanence && test('for await...of db.iterator() (deferred)', async function (t) {
    t.plan(1)

    const db = testCommon.factory()
    await db.batch(input.map(entry => ({ ...entry, type: 'put' })))
    await db.close()

    // Don't await
    db.open()

    const it = db.iterator({ keyEncoding: 'utf8', valueEncoding: 'utf8' })
    const output = []

    for await (const [key, value] of it) {
      output.push({ key, value })
    }

    t.same(output, input)
    await db.close()
  })

  testCommon.supports.snapshots && test('for await...of db.iterator() (deferred, with snapshot)', async function (t) {
    t.plan(2)

    const db = testCommon.factory()
    const it = db.iterator({ keyEncoding: 'utf8', valueEncoding: 'utf8' })
    const promise = db.batch(input.map(entry => ({ ...entry, type: 'put' })))
    const output = []

    for await (const [key, value] of it) {
      output.push({ key, value })
    }

    t.same(output, [], 'used snapshot')

    // Wait for data to be written
    await promise

    for await (const [key, value] of db.iterator({ keyEncoding: 'utf8', valueEncoding: 'utf8' })) {
      output.push({ key, value })
    }

    t.same(output, input)
  })

  test('for await...of db.iterator() (empty)', async function (t) {
    const db = testCommon.factory()
    const entries = []

    await db.open()

    for await (const kv of db.iterator({ keyEncoding: 'utf8', valueEncoding: 'utf8' })) {
      entries.push(kv)
    }

    t.same(entries, [])
  })

  test('for await...of db.iterator() (empty, deferred)', async function (t) {
    const db = testCommon.factory()
    const entries = []

    for await (const kv of db.iterator({ keyEncoding: 'utf8', valueEncoding: 'utf8' })) {
      entries.push(kv)
    }

    t.same(entries, [])
  })

  test('for await...of db.iterator() does not permit reuse', async function (t) {
    t.plan(3)

    const it = db.iterator()

    // eslint-disable-next-line no-unused-vars
    for await (const [key, value] of it) {
      t.pass('nexted')
    }

    try {
      // eslint-disable-next-line no-unused-vars
      for await (const [key, value] of it) {
        t.fail('should not be called')
      }
    } catch (err) {
      t.is(err.message, 'Iterator is not open')
    }
  })
}

exports.teardown = function (test, testCommon) {
  test('teardown', function (t) {
    t.plan(1)

    db.close(function (err) {
      t.ifError(err, 'no close() error')
    })
  })
}

exports.all = function (test, testCommon) {
  exports.setup(test, testCommon)
  exports.asyncIterator(test, testCommon)
  exports.teardown(test, testCommon)
}
