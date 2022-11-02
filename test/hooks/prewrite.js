'use strict'

module.exports = function (test, testCommon) {
  for (const deferred of [false, true]) {
    test(`prewrite hook function receives put op (deferred: ${deferred})`, async function (t) {
      t.plan(3)

      const db = testCommon.factory()
      if (!deferred) await db.open()

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

      return db.close()
    })

    test(`prewrite hook function receives del op (deferred: ${deferred})`, async function (t) {
      t.plan(3)

      const db = testCommon.factory()
      if (!deferred) await db.open()

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

      return db.close()
    })

    test(`prewrite hook function receives put op with custom encodings and userland option (deferred: ${deferred})`, async function (t) {
      t.plan(3)

      const db = testCommon.factory()
      if (!deferred) await db.open()

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

      return db.close()
    })

    test(`prewrite hook function receives del op with custom encodings and userland option (deferred: ${deferred})`, async function (t) {
      t.plan(3)

      const db = testCommon.factory()
      if (!deferred) await db.open()

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

      return db.close()
    })

    test(`prewrite hook function can modify put operation (deferred: ${deferred})`, async function (t) {
      t.plan(10 * 3)

      const db = testCommon.factory({ keyEncoding: 'json', valueEncoding: 'utf8' })
      if (!deferred) await db.open()

      db.hooks.prewrite.add(function (op, batch) {
        t.is(op.keyEncoding, db.keyEncoding('json'))
        t.is(op.valueEncoding, db.valueEncoding('utf8'))

        op.key = '456'
        op.value = { x: 1 }

        // Flip the encodings
        op.keyEncoding = 'utf8'
        op.valueEncoding = 'json'

        // Test adding a userland option
        op.userland = 456
      })

      db.on('write', function (ops) {
        t.is(ops.length, 1)
        t.is(ops[0].key, '456')
        t.same(ops[0].value, { x: 1 })
        t.is(ops[0].keyEncoding, db.keyEncoding('utf8'))
        t.is(ops[0].valueEncoding, db.valueEncoding('json'))
        t.same(ops[0].encodedKey, db.keyEncoding('utf8').encode('456'))
        t.same(ops[0].encodedValue, db.valueEncoding('json').encode({ x: 1 }))
        t.is(ops[0].userland, 456)
      })

      await db.put(123, 'boop')
      await db.batch([{ type: 'put', key: 123, value: 'boop' }])
      await db.batch().put(123, 'boop').write()

      return db.close()
    })

    test(`prewrite hook function can modify del operation (deferred: ${deferred})`, async function (t) {
      t.plan(6 * 3)

      const db = testCommon.factory({ keyEncoding: 'json' })
      if (!deferred) await db.open()

      db.hooks.prewrite.add(function (op, batch) {
        t.is(op.keyEncoding, db.keyEncoding('json'))

        op.key = '456'
        op.keyEncoding = 'utf8'

        // Test adding a userland option
        op.userland = 456
      })

      db.on('write', function (ops) {
        t.is(ops.length, 1)
        t.is(ops[0].key, '456')
        t.is(ops[0].keyEncoding, db.keyEncoding('utf8'))
        t.same(ops[0].encodedKey, db.keyEncoding('utf8').encode('456'))
        t.is(ops[0].userland, 456)
      })

      await db.del(123)
      await db.batch([{ type: 'del', key: 123 }])
      await db.batch().del(123).write()

      return db.close()
    })

    test(`prewrite hook function triggered by put can add operations (deferred: ${deferred})`, async function (t) {
      t.plan(3)

      const db = testCommon.factory()
      if (!deferred) await db.open()

      // Note: may return a transcoder encoding
      const utf8 = db.keyEncoding('utf8')
      const json = db.valueEncoding('json')

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
            encodedKey: utf8.encode('beep'),
            encodedValue: utf8.encode('boop')
          },
          {
            type: 'put',
            key: 'from-hook',
            value: { abc: 123 },
            keyEncoding: db.keyEncoding('utf8'),
            valueEncoding: db.valueEncoding('json'),
            encodedKey: utf8.encode('from-hook'),
            encodedValue: json.encode({ abc: 123 })
          }
        ])
      })

      await db.put('beep', 'boop')
      await db.batch([{ type: 'put', key: 'beep', value: 'boop' }])
      await db.batch().put('beep', 'boop').write()

      return db.close()
    })

    test(`prewrite hook function triggered by del can add operations (deferred: ${deferred})`, async function (t) {
      t.plan(3)

      const db = testCommon.factory()
      if (!deferred) await db.open()

      // Note: may return a transcoder encoding
      const utf8 = db.keyEncoding('utf8')

      db.hooks.prewrite.add(function (op, batch) {
        batch.add({ type: 'del', key: 'from-hook' })
      })

      db.on('write', function (ops) {
        t.same(ops, [
          {
            type: 'del',
            key: 'beep',
            keyEncoding: db.keyEncoding('utf8'),
            encodedKey: utf8.encode('beep')
          },
          {
            type: 'del',
            key: 'from-hook',
            keyEncoding: db.keyEncoding('utf8'),
            encodedKey: utf8.encode('from-hook')
          }
        ])
      })

      await db.del('beep')
      await db.batch([{ type: 'del', key: 'beep' }])
      await db.batch().del('beep').write()

      return db.close()
    })

    test(`prewrite hook function is called once for every input operation (deferred: ${deferred})`, async function (t) {
      t.plan(2)

      const calls = []
      const db = testCommon.factory()
      if (!deferred) await db.open()

      db.hooks.prewrite.add(function (op, batch) {
        calls.push(op.key)
      })

      await db.batch([{ type: 'del', key: '1' }, { type: 'put', key: '2', value: '123' }])
      t.same(calls.splice(0, calls.length), ['1', '2'])

      await db.batch().del('1').put('2', '123').write()
      t.same(calls.splice(0, calls.length), ['1', '2'])

      return db.close()
    })

    test(`prewrite hook adds operations after input operations (deferred: ${deferred})`, async function (t) {
      t.plan(2)

      const db = testCommon.factory()
      if (!deferred) await db.open()

      db.hooks.prewrite.add(function (op, batch) {
        if (op.key === 'input1') {
          batch
            .add({ type: 'del', key: 'hook1' })
            .add({ type: 'del', key: 'hook2' })
            .add({ type: 'put', key: 'hook3', value: 'foo' })
        }
      })

      db.on('write', function (ops) {
        t.same(ops.map(op => op.key), [
          'input1', 'input2', 'hook1', 'hook2', 'hook3'
        ], 'order is correct')
      })

      await db.batch([{ type: 'del', key: 'input1' }, { type: 'put', key: 'input2', value: '123' }])
      await db.batch().del('input1').put('input2', '123').write()

      return db.close()
    })

    test(`prewrite hook does not copy input options to added operations (deferred: ${deferred})`, async function (t) {
      t.plan(6)

      const db = testCommon.factory()
      if (!deferred) await db.open()

      db.hooks.prewrite.add(function (op, batch) {
        batch.add({ type: 'put', key: 'from-hook-a', value: 'xyz' })
        batch.add({ type: 'del', key: 'from-hook-b' })
      })

      db.on('write', function (ops) {
        const relevant = ops.map(op => {
          return {
            key: op.key,
            hasOption: 'userland' in op,
            keyEncoding: op.keyEncoding.commonName
          }
        })

        t.same(relevant, [
          {
            key: 'input-a',
            keyEncoding: 'json',
            hasOption: true
          },
          {
            key: 'from-hook-a',
            keyEncoding: 'utf8', // Should be the database default (2x)
            hasOption: false
          },
          {
            key: 'from-hook-b',
            keyEncoding: 'utf8',
            hasOption: false
          }
        ])
      })

      await db.put('input-a', 'boop', { keyEncoding: 'json', userland: 123 })
      await db.batch([{ type: 'put', key: 'input-a', value: 'boop', keyEncoding: 'json', userland: 123 }])
      await db.batch().put('input-a', 'boop', { keyEncoding: 'json', userland: 123 }).write()

      await db.del('input-a', { keyEncoding: 'json', userland: 123 })
      await db.batch([{ type: 'del', key: 'input-a', keyEncoding: 'json', userland: 123 }])
      await db.batch().del('input-a', { keyEncoding: 'json', userland: 123 }).write()

      return db.close()
    })

    test(`error thrown from prewrite hook function is catched (deferred: ${deferred})`, async function (t) {
      t.plan(6 * 2)

      const db = testCommon.factory()
      if (!deferred) await db.open()

      db.hooks.prewrite.add(function (op, batch) {
        throw new Error('test')
      })

      const verify = (err) => {
        t.is(err.code, 'LEVEL_HOOK_ERROR')
        t.is(err.cause.message, 'test')
      }

      await db.batch([{ type: 'del', key: '1' }]).catch(verify)
      await db.batch([{ type: 'put', key: '1', value: '2' }]).catch(verify)

      const batch1 = db.batch()
      const batch2 = db.batch()

      try { batch1.del('1') } catch (err) { verify(err) }
      try { batch2.put('1', '2') } catch (err) { verify(err) }

      await batch1.close()
      await batch2.close()

      await db.del('1').catch(verify)
      await db.put('1', '2').catch(verify)

      return db.close()
    })
  }

  test('operations added by prewrite hook function count towards chained batch length', async function (t) {
    t.plan(2)

    const db = testCommon.factory()
    await db.open()

    db.hooks.prewrite.add(function (op, batch) {
      batch.add({ type: 'del', key: 'hook1' })
    })

    const batch = db.batch()

    batch.del('input1')
    t.is(batch.length, 2)

    batch.put('input2', 'foo')
    t.is(batch.length, 4)

    await batch.close()
    return db.close()
  })

  test('operations added by prewrite hook function can be cleared from chained batch', async function (t) {
    t.plan(3)

    const db = testCommon.factory()
    await db.open()

    db.hooks.prewrite.add(function (op, batch) {
      batch.add({ type: 'put', key: 'x', value: 'y' })
    })

    const batch = db.batch()

    batch.del('a')
    t.is(batch.length, 2)

    batch.clear()
    t.is(batch.length, 0)

    db.on('write', t.fail.bind(t))
    await batch.write()

    t.same(await db.keys().all(), [], 'did not write to db')
    return db.close()
  })

  test('prewrite hook function is not called for earlier chained batch', async function (t) {
    t.plan(2)

    const db = testCommon.factory()
    await db.open()

    const calls = []
    const batchBefore = db.batch()

    db.hooks.prewrite.add(function (op, batch) {
      calls.push(op.key)
    })

    batchBefore.del('before')
    t.same(calls, [])

    const batchAfter = db.batch()
    batchAfter.del('after')
    t.same(calls, ['after'])

    await Promise.all([batchBefore.close(), batchAfter.close()])
    return db.close()
  })
}
