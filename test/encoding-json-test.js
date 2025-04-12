'use strict'

// NOTE: copied from levelup
exports.all = function (test, testCommon) {
  for (const deferred of [false, true]) {
    test(`json encoding: simple-object values (deferred: ${deferred})`, async function (t) {
      return run(t, deferred, [
        { key: '0', value: 0 },
        { key: '1', value: 1 },
        { key: '2', value: 'a string' },
        { key: '3', value: true },
        { key: '4', value: false }
      ])
    })

    test(`json encoding: simple-object keys (deferred: ${deferred})`, async function (t) {
      return run(t, deferred, [
        { value: 'string', key: 'a string' },
        { value: '0', key: 0 },
        { value: '1', key: 1 },
        { value: 'false', key: false },
        { value: 'true', key: true }
      ])
    })

    test(`json encoding: complex-object values (deferred: ${deferred})`, async function (t) {
      return run(t, deferred, [{
        key: '0',
        value: {
          foo: 'bar',
          bar: [1, 2, 3],
          bang: { yes: true, no: false }
        }
      }])
    })

    test(`json encoding: complex-object keys (deferred: ${deferred})`, async function (t) {
      return run(t, deferred, [{
        value: '0',
        key: {
          foo: 'bar',
          bar: [1, 2, 3],
          bang: { yes: true, no: false }
        }
      }])
    })
  }

  async function run (t, deferred, entries) {
    const db = testCommon.factory({ keyEncoding: 'json', valueEncoding: 'json' })
    const operations = entries.map(entry => ({ type: 'put', ...entry }))

    if (!deferred) await db.open()

    await db.batch(operations)
    await Promise.all([...entries.map(testGet), testIterator()])

    if (testCommon.supports.getSync) {
      for (const entry of entries) {
        t.same(db.getSync(entry.key), entry.value)
      }
    }

    return db.close()

    async function testGet (entry) {
      t.same(await db.get(entry.key), entry.value)
    }

    async function testIterator () {
      const result = await db.iterator().all()
      t.same(result, entries.map(kv => [kv.key, kv.value]))
    }
  }
}
