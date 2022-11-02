'use strict'

module.exports = function (test, testCommon) {
  // TODO: test modification of op
  test('hooks.prewrite triggered by put', async function (t) {
    t.plan(3)

    const db = testCommon.factory()

    db.hooks.prewrite.add(function (op, batch) {
      t.same(op, {
        type: 'put',
        key: 'beep',
        value: 'boop',
        keyEncoding: db.keyEncoding('utf8'),
        valueEncoding: db.valueEncoding('utf8')
      })
    })

    await db.put('beep', 'boop')
    await db.batch([{ type: 'put', key: 'beep', value: 'boop' }])
    await db.batch().put('beep', 'boop').write()
  })

  test('hooks.prewrite triggered by put with custom encodings and userland option', async function (t) {
    t.plan(3)

    const db = testCommon.factory()

    db.hooks.prewrite.add(function (op, batch) {
      t.same(op, {
        type: 'put',
        key: 123, // Should not be JSON-encoded
        value: 'boop',
        keyEncoding: db.keyEncoding('json'),
        valueEncoding: db.valueEncoding('json'),
        userland: 456
      })
    })

    await db.put(123, 'boop', { keyEncoding: 'json', valueEncoding: 'json', userland: 456 })
    await db.batch([{ type: 'put', key: 123, value: 'boop', keyEncoding: 'json', valueEncoding: 'json', userland: 456 }])
    await db.batch().put(123, 'boop', { keyEncoding: 'json', valueEncoding: 'json', userland: 456 }).write()
  })

  test('hooks.prewrite triggered by del', async function (t) {
    t.plan(3)

    const db = testCommon.factory()

    db.hooks.prewrite.add(function (op, batch) {
      t.same(op, {
        type: 'del',
        key: 'beep',
        keyEncoding: db.keyEncoding('utf8')
      })
    })

    await db.del('beep')
    await db.batch([{ type: 'del', key: 'beep' }])
    await db.batch().del('beep').write()
  })

  test('hooks.prewrite triggered by del with custom encodings and userland option', async function (t) {
    t.plan(3)

    const db = testCommon.factory()

    db.hooks.prewrite.add(function (op, batch) {
      t.same(op, {
        type: 'del',
        key: 123, // Should not be JSON-encoded
        keyEncoding: db.keyEncoding('json'),
        userland: 456
      })
    })

    await db.del(123, { keyEncoding: 'json', userland: 456 })
    await db.batch([{ type: 'del', key: 123, keyEncoding: 'json', userland: 456 }])
    await db.batch().del(123, { keyEncoding: 'json', userland: 456 }).write()
  })

  // No need to separately test a del trigger; we do that above
  // TODO: test order of operations
  test('hooks.prewrite can add operations', async function (t) {
    t.plan(3)

    const db = testCommon.factory()

    db.hooks.prewrite.add(function (op, batch) {
      batch.add({
        type: 'put',
        key: 'from-hook',
        value: { abc: 123 },
        valueEncoding: 'json'
      })
    })

    db.on('write', function (ops) {
      t.same(ops, [
        {
          type: 'put',
          key: 'beep',
          value: 'boop',
          keyEncoding: db.keyEncoding('utf8'),
          valueEncoding: db.valueEncoding('utf8'),
          encodedKey: 'beep',
          encodedValue: 'boop'
        },
        {
          type: 'put',
          key: 'from-hook',
          value: { abc: 123 },
          keyEncoding: db.keyEncoding('utf8'),
          valueEncoding: db.valueEncoding('json'),
          encodedKey: 'from-hook',
          encodedValue: '{"abc":123}'
        }
      ])
    })

    await db.put('beep', 'boop')
    await db.batch([{ type: 'put', key: 'beep', value: 'boop' }])
    await db.batch().put('beep', 'boop').write()
  })
}
