'use strict'

const shared = require('./shared')

module.exports = function (test, testCommon) {
  shared(test, testCommon, 'prewrite')

  for (const deferred of [false, true]) {
    for (const type of ['put', 'del']) {
      for (const method of ['batch', 'chained batch', 'singular']) {
        test(`prewrite hook function is called after open (deferred: ${deferred})`, async function (t) {
          t.plan(1)

          const db = testCommon.factory()
          if (!deferred) await db.open()

          db.hooks.prewrite.add(function (op, batch) {
            t.is(db.status, 'open')
          })

          if (type === 'put') {
            switch (method) {
              case 'batch':
                await db.batch([{ type: 'put', key: 'beep', value: 'boop' }])
                break
              case 'chained batch':
                // Does not support deferred open
                await db.open()
                await db.batch().put('beep', 'boop').write()
                break
              case 'singular':
                await db.put('beep', 'boop')
                break
            }
          } else if (type === 'del') {
            switch (method) {
              case 'batch':
                await db.batch([{ type: 'del', key: 'beep' }])
                break
              case 'chained batch':
                // Does not support deferred open
                await db.open()
                await db.batch().del('beep').write()
                break
              case 'singular':
                await db.del('beep')
                break
            }
          }

          return db.close()
        })
      }
    }
  }

  test('prewrite hook function receives put op', async function (t) {
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

    return db.close()
  })

  test('prewrite hook function receives del op', async function (t) {
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

    return db.close()
  })

  test('prewrite hook function receives put op with custom encodings and userland option', async function (t) {
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

    return db.close()
  })

  test('prewrite hook function receives del op with custom encodings and userland option', async function (t) {
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

    return db.close()
  })

  test('prewrite hook function can modify put operation', async function (t) {
    t.plan(10 * 3)

    const db = testCommon.factory({ keyEncoding: 'json', valueEncoding: 'utf8' })

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

  test('prewrite hook function can modify del operation', async function (t) {
    t.plan(6 * 3)

    const db = testCommon.factory({ keyEncoding: 'json' })

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

  test('second prewrite hook function sees modified operation of first', async function (t) {
    t.plan(6 * 2)

    const db = testCommon.factory()

    db.hooks.prewrite.add(function (op, batch) {
      t.is(op.key, '1')
      op.key = '2'
    })

    db.hooks.prewrite.add(function (op, batch) {
      t.is(op.key, '2')
    })

    await db.put('1', 'boop')
    await db.batch([{ type: 'put', key: '1', value: 'boop' }])
    await db.batch().put('1', 'boop').write()

    await db.del('1')
    await db.batch([{ type: 'del', key: '1' }])
    await db.batch().del('1').write()

    return db.close()
  })

  test('prewrite hook function triggered by put can add put operation', async function (t) {
    t.plan(3)

    const db = testCommon.factory()

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

  test('prewrite hook function triggered by del can add del operation', async function (t) {
    t.plan(3)

    const db = testCommon.factory()

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

  test('prewrite hook function can add operations with sublevel option', async function (t) {
    t.plan(2 * 6)

    const db = testCommon.factory()
    const sublevel = db.sublevel('sub', { keyEncoding: 'json', valueEncoding: 'json' })

    // Note: may return a transcoder encoding
    const utf8 = db.keyEncoding('utf8')

    db.hooks.prewrite.add(function (op, batch) {
      batch.add({ type: 'put', key: 'from-hook-1', value: { x: 22 }, sublevel })
      batch.add({ type: 'del', key: 'from-hook-2', sublevel })
    })

    db.on('write', function (ops) {
      t.is(ops[0].key, 'from-input')
      t.same(ops.slice(1), [
        {
          type: 'put',
          key: utf8.encode('!sub!"from-hook-1"'),
          value: utf8.encode('{"x":22}'),
          keyEncoding: db.keyEncoding(sublevel.keyEncoding().format),
          valueEncoding: db.valueEncoding(sublevel.valueEncoding().format),
          encodedKey: utf8.encode('!sub!"from-hook-1"'),
          encodedValue: utf8.encode('{"x":22}'),
          sublevel: null // Should be unset
        },
        {
          type: 'del',
          key: utf8.encode('!sub!"from-hook-2"'),
          keyEncoding: db.keyEncoding(sublevel.keyEncoding().format),
          encodedKey: utf8.encode('!sub!"from-hook-2"'),
          sublevel: null // Should be unset
        }
      ])
    })

    await db.put('from-input', 'abc')
    await db.batch([{ type: 'put', key: 'from-input', value: 'abc' }])
    await db.batch().put('from-input', 'abc').write()

    await db.del('from-input')
    await db.batch([{ type: 'del', key: 'from-input' }])
    await db.batch().del('from-input').write()

    return db.close()
  })

  test('prewrite hook function can add operations with descendant sublevel option', async function (t) {
    t.plan(20)

    const db = testCommon.factory()
    await db.open()

    const a = db.sublevel('a')
    const b = a.sublevel('b')
    const c = b.sublevel('c')

    // Note: may return a transcoder encoding
    const utf8 = db.keyEncoding('utf8')

    const put = async (db, key, opts) => {
      const fn = function (op, batch) {
        batch.add({ type: 'put', key, value: 'x', ...opts })
      }

      db.hooks.prewrite.add(fn)

      try {
        await db.put('0', '0')
      } finally {
        db.hooks.prewrite.delete(fn)
      }
    }

    const del = async (db, key, opts) => {
      const fn = function (op, batch) {
        batch.add({ type: 'del', key, ...opts })
      }

      db.hooks.prewrite.add(fn)

      try {
        await db.del('0')
      } finally {
        db.hooks.prewrite.delete(fn)
      }
    }

    // Note: not entirely a noop. Use of sublevel option triggers data to be encoded early
    db.on('write', (ops) => t.same(ops[1].key, utf8.encode('1'), 'got put 1'))
    await put(db, '1', { sublevel: db })

    db.removeAllListeners('write')
    db.on('write', (ops) => t.same(ops[1].key, utf8.encode('!a!2'), 'got put 2'))
    await put(db, '2', { sublevel: a })
    await put(a, '2', { sublevel: a }) // Same

    db.removeAllListeners('write')
    db.on('write', (ops) => t.same(ops[1].key, utf8.encode('!a!!b!3'), 'got put 3'))
    await put(db, '3', { sublevel: b })
    await put(a, '3', { sublevel: b }) // Same
    await put(b, '3', { sublevel: b }) // Same

    db.removeAllListeners('write')
    db.on('write', (ops) => t.same(ops[1].key, utf8.encode('!a!!b!!c!4'), 'got put 4'))
    await put(db, '4', { sublevel: c })
    await put(a, '4', { sublevel: c }) // Same
    await put(b, '4', { sublevel: c }) // Same
    await put(c, '4', { sublevel: c }) // Same

    // Test deletes
    db.removeAllListeners('write')
    db.on('write', (ops) => t.same(ops[1].key, utf8.encode('1'), 'got del 1'))
    await del(db, '1', { sublevel: db })

    db.removeAllListeners('write')
    db.on('write', (ops) => t.same(ops[1].key, utf8.encode('!a!2'), 'got del 2'))
    await del(db, '2', { sublevel: a })
    await del(a, '2', { sublevel: a }) // Same

    db.removeAllListeners('write')
    db.on('write', (ops) => t.same(ops[1].key, utf8.encode('!a!!b!3'), 'got del 3'))
    await del(db, '3', { sublevel: b })
    await del(a, '3', { sublevel: b }) // Same
    await del(b, '3', { sublevel: b }) // Same

    db.removeAllListeners('write')
    db.on('write', (ops) => t.same(ops[1].key, utf8.encode('!a!!b!!c!4'), 'got del 4'))
    await del(db, '4', { sublevel: c })
    await del(a, '4', { sublevel: c }) // Same
    await del(b, '4', { sublevel: c }) // Same
    await del(c, '4', { sublevel: c }) // Same

    return db.close()
  })

  test('prewrite hook is triggered bottom-up for nested sublevels', async function (t) {
    const db = testCommon.factory()
    const a = db.sublevel('a')
    const b = a.sublevel('b')
    const order = []
    const triggers = [
      [['b', 'a', 'root'], () => b.put('a', 'a')],
      [['b', 'a', 'root'], () => b.batch([{ type: 'put', key: 'a', value: 'a' }])],
      [['b', 'a', 'root'], () => b.batch().put('a', 'a').write()],
      [['b', 'a', 'root'], () => b.del('a')],
      [['b', 'a', 'root'], () => b.batch([{ type: 'del', key: 'a' }])],
      [['b', 'a', 'root'], () => b.batch().del('a').write()],

      [['a', 'root'], () => a.put('a', 'a')],
      [['a', 'root'], () => a.batch([{ type: 'put', key: 'a', value: 'a' }])],
      [['a', 'root'], () => a.batch().put('a', 'a').write()],
      [['a', 'root'], () => a.del('a')],
      [['a', 'root'], () => a.batch([{ type: 'del', key: 'a' }])],
      [['a', 'root'], () => a.batch().del('a').write()],

      [['root'], () => db.put('a', 'a')],
      [['root'], () => db.batch([{ type: 'put', key: 'a', value: 'a' }])],
      [['root'], () => db.batch().put('a', 'a').write()],
      [['root'], () => db.del('a')],
      [['root'], () => db.batch([{ type: 'del', key: 'a' }])],
      [['root'], () => db.batch().del('a').write()],

      // The sublevel option should not trigger the prewrite hook
      [['root'], () => db.put('a', 'a', { sublevel: a })],
      [['root'], () => db.batch([{ type: 'put', key: 'a', value: 'a', sublevel: a }])],
      [['root'], () => db.batch().put('a', 'a', { sublevel: a }).write()],
      [['root'], () => db.del('a', { sublevel: a })],
      [['root'], () => db.batch([{ type: 'del', key: 'a', sublevel: a }])],
      [['root'], () => db.batch().del('a', { sublevel: a }).write()]
    ]

    t.plan(triggers.length)

    db.hooks.prewrite.add((op, batch) => { order.push('root') })
    a.hooks.prewrite.add((op, batch) => { order.push('a') })
    b.hooks.prewrite.add((op, batch) => { order.push('b') })

    for (const [expectedOrder, trigger] of triggers) {
      await trigger()
      t.same(order.splice(0, order.length), expectedOrder)
    }

    return db.close()
  })

  test('db catches invalid operations added by prewrite hook function', async function (t) {
    const db = testCommon.factory()
    const errEncoding = {
      name: 'test',
      format: 'utf8',
      encode () {
        throw new Error()
      },
      decode () {
        throw new Error()
      }
    }

    const hookFunctions = [
      (op, batch) => batch.add(),
      (op, batch) => batch.add({}),
      (op, batch) => batch.add({ type: 'del' }),
      (op, batch) => batch.add({ type: 'del', key: null }),
      (op, batch) => batch.add({ type: 'del', key: undefined }),
      (op, batch) => batch.add({ type: 'put', key: 'a' }),
      (op, batch) => batch.add({ type: 'put', key: 'a', value: null }),
      (op, batch) => batch.add({ type: 'put', key: 'a', value: undefined }),
      (op, batch) => batch.add({ type: 'nope', key: 'a', value: 'b' }),
      (op, batch) => batch.add({ type: 'del', key: 'a', keyEncoding: errEncoding }),
      (op, batch) => batch.add({ type: 'put', key: 'a', value: 'b', keyEncoding: errEncoding }),
      (op, batch) => batch.add({ type: 'put', key: 'a', value: 'b', valueEncoding: errEncoding })
    ]

    const triggers = [
      () => db.put('beep', 'boop'),
      () => db.batch([{ type: 'put', key: 'beep', value: 'boop' }]),
      () => db.batch().put('beep', 'boop').write(),
      () => db.del('beep'),
      () => db.batch([{ type: 'del', key: 'beep' }]),
      () => db.batch().del('beep').write()
    ]

    t.plan(hookFunctions.length * triggers.length * 2)

    db.on('write', function (ops) {
      t.fail('should not write')
    })

    for (const trigger of triggers) {
      for (const fn of hookFunctions) {
        db.hooks.prewrite.add(fn)

        try {
          await trigger()
        } catch (err) {
          t.is(err.code, 'LEVEL_HOOK_ERROR')
        }

        db.hooks.prewrite.delete(fn)
        t.is(db.hooks.prewrite.noop, true)
      }
    }

    return db.close()
  })

  test('prewrite hook function is called once for every input operation', async function (t) {
    t.plan(2)

    const calls = []
    const db = testCommon.factory()

    db.hooks.prewrite.add(function (op, batch) {
      calls.push(op.key)
    })

    await db.batch([{ type: 'del', key: '1' }, { type: 'put', key: '2', value: '123' }])
    t.same(calls.splice(0, calls.length), ['1', '2'])

    await db.batch().del('1').put('2', '123').write()
    t.same(calls.splice(0, calls.length), ['1', '2'])

    return db.close()
  })

  test('prewrite hook adds operations after input operations', async function (t) {
    t.plan(2)

    const db = testCommon.factory()

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

  test('prewrite hook does not copy input options to added operations', async function (t) {
    t.plan(6)

    const db = testCommon.factory()

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

  test('error thrown from prewrite hook function is catched', async function (t) {
    t.plan(6 * 2)

    const db = testCommon.factory()

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

  // See https://github.com/Level/abstract-level/issues/80
  test('prewrite hook function can write to nondescendant sublevel', async function (t) {
    t.plan(2)

    const db = testCommon.factory()
    await db.open()

    const textDecoder = new TextDecoder()
    const books = db.sublevel('books', { valueEncoding: 'json' })
    const index = db.sublevel('authors', {
      // Use JSON, which normally doesn't make sense for keys but
      // helps to assert that there's no double encoding happening.
      keyEncoding: 'json'
    })

    db.on('write', (ops) => {
      // Check that data is written to correct sublevels, specifically
      // !authors!Hesse~12 rather than !books!!authors!Hesse~12.
      t.same(ops.map(x => decode(x.key)), ['!books!12', '!authors!"Hesse~12"'])

      // It's unfortunate DX but because the write is made via the sublevel, the
      // format of keys depends on the supported encodings of db. For example on
      // a MemoryLevel({ storeEncoding: 'buffer' }) the key will be a buffer.
      function decode (key) {
        return db.keyEncoding('utf8').format === 'utf8' ? key : textDecoder.decode(key)
      }
    })

    books.on('write', (ops) => {
      // Should not include the op of the index
      t.same(ops.map(x => x.key), ['12'])
    })

    index.on('write', (ops) => {
      t.fail('Did not expect an event on index')
    })

    books.hooks.prewrite.add(function (op, batch) {
      if (op.type === 'put') {
        batch.add({
          type: 'put',
          // Key structure is synthetic and not relevant to the test
          key: op.value.author + '~' + op.key,
          value: '',
          sublevel: index
        })
      }
    })

    await books.put('12', { title: 'Siddhartha', author: 'Hesse' })
  })
}
