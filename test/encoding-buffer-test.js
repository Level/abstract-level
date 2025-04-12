'use strict'

const { Buffer } = require('buffer')
const textEncoder = new TextEncoder()

exports.all = function (test, testCommon) {
  if (!testCommon.supports.encodings.buffer) return

  // NOTE: adapted from levelup
  test('put() and get() with buffer value and buffer valueEncoding', async function (t) {
    const db = testCommon.factory()
    await db.open()
    await db.put('test', testBuffer(), { valueEncoding: 'buffer' })

    t.same(await db.get('test', { valueEncoding: 'buffer' }), testBuffer())

    if (testCommon.supports.getSync) {
      t.same(db.getSync('test', { valueEncoding: 'buffer' }), testBuffer(), 'sync')
    }

    return db.close()
  })

  // NOTE: adapted from levelup
  test('put() and get() with buffer value and buffer valueEncoding in factory', async function (t) {
    const db = testCommon.factory({ valueEncoding: 'buffer' })
    await db.open()
    await db.put('test', testBuffer())

    t.same(await db.get('test'), testBuffer())

    if (testCommon.supports.getSync) {
      t.same(db.getSync('test'), testBuffer(), 'sync')
    }

    return db.close()
  })

  // NOTE: adapted from levelup
  test('put() and get() with buffer key and buffer keyEncoding', async function (t) {
    const db = testCommon.factory()
    await db.open()
    await db.put(testBuffer(), 'test', { keyEncoding: 'buffer' })

    t.same(await db.get(testBuffer(), { keyEncoding: 'buffer' }), 'test')

    if (testCommon.supports.getSync) {
      t.same(db.getSync(testBuffer(), { keyEncoding: 'buffer' }), 'test', 'sync')
    }

    return db.close()
  })

  // NOTE: adapted from levelup
  test('put() and get() with buffer key and utf8 keyEncoding', async function (t) {
    const db = testCommon.factory()
    await db.open()
    await db.put(Buffer.from('foo🐄'), 'test', { keyEncoding: 'utf8' })

    t.same(await db.get(Buffer.from('foo🐄'), { keyEncoding: 'utf8' }), 'test')

    if (testCommon.supports.getSync) {
      t.same(db.getSync(Buffer.from('foo🐄'), { keyEncoding: 'utf8' }), 'test', 'sync')
    }

    return db.close()
  })

  // NOTE: adapted from levelup
  test('put() and get() with string value and buffer valueEncoding', async function (t) {
    const db = testCommon.factory()
    await db.open()
    await db.put('test', 'foo🐄', { valueEncoding: 'buffer' })

    t.same(await db.get('test', { valueEncoding: 'buffer' }), Buffer.from('foo🐄'))
    t.same(await db.get('test', { valueEncoding: 'utf8' }), 'foo🐄')

    if (testCommon.supports.getSync) {
      t.same(db.getSync('test', { valueEncoding: 'buffer' }), Buffer.from('foo🐄'), 'sync')
      t.same(db.getSync('test', { valueEncoding: 'utf8' }), 'foo🐄', 'sync')
    }

    return db.close()
  })

  // NOTE: adapted from memdown
  test('put() as string, get() as buffer and vice versa', async function (t) {
    const db = testCommon.factory()
    await db.open()
    const enc = { keyEncoding: 'buffer', valueEncoding: 'buffer' }
    const [a, b] = ['🐄', '🐄 says moo']

    const promise1 = db.put(a, a).then(async () => {
      const value = await db.get(Buffer.from(a), enc)
      t.same(value, Buffer.from(a), 'got buffer value')

      if (testCommon.supports.getSync) {
        t.same(db.getSync(Buffer.from(a), enc), Buffer.from(a), 'got buffer value (sync)')
      }
    })

    const promise2 = db.put(Buffer.from(b), Buffer.from(b), enc).then(async () => {
      const value = await db.get(b)
      t.same(value, b, 'got string value')

      if (testCommon.supports.getSync) {
        t.same(db.getSync(b), b, 'got string value (sync)')
      }
    })

    await Promise.all([promise1, promise2])
    return db.close()
  })

  // NOTE: adapted from memdown
  test('put() stringifies input to buffer', async function (t) {
    const db = testCommon.factory()
    await db.open()
    await db.put(1, 2)

    const it = db.iterator({ keyEncoding: 'buffer', valueEncoding: 'buffer' })
    const entries = await it.all()

    t.same(entries[0][0], Buffer.from('1'), 'key was stringified')
    t.same(entries[0][1], Buffer.from('2'), 'value was stringified')

    return db.close()
  })

  // NOTE: adapted from memdown
  test('put() as string, iterate as buffer', async function (t) {
    const db = testCommon.factory({ keyEncoding: 'utf8', valueEncoding: 'utf8' })
    await db.open()
    await db.put('🐄', '🐄')

    const it = db.iterator({ keyEncoding: 'buffer', valueEncoding: 'buffer' })
    const entries = await it.all()

    t.same(entries, [[Buffer.from('🐄'), Buffer.from('🐄')]])
    return db.close()
  })

  // NOTE: adapted from memdown
  test('put() as buffer, iterate as string', async function (t) {
    const db = testCommon.factory({ keyEncoding: 'buffer', valueEncoding: 'buffer' })
    await db.open()
    await db.put(Buffer.from('🐄'), Buffer.from('🐄'))

    const it = db.iterator({ keyEncoding: 'utf8', valueEncoding: 'utf8' })
    const entries = await it.all()

    t.same(entries, [['🐄', '🐄']])
    return db.close()
  })

  test('put() as view, iterate as view', async function (t) {
    const db = testCommon.factory({ keyEncoding: 'view', valueEncoding: 'view' })
    const cow = textEncoder.encode('🐄')
    await db.open()
    await db.put(cow, cow)

    const it = db.iterator()
    const entries = await it.all()
    const key = Buffer.isBuffer(entries[0][0]) ? Buffer.from(cow) : cow // Valid, Buffer is a Uint8Array
    const value = Buffer.isBuffer(entries[0][1]) ? Buffer.from(cow) : cow

    t.same(entries, [[key, value]])
    return db.close()
  })

  test('put() as string, iterate as view', async function (t) {
    const db = testCommon.factory({ keyEncoding: 'utf8', valueEncoding: 'utf8' })
    const cow = textEncoder.encode('🐄')
    await db.open()
    await db.put('🐄', '🐄')

    const it = db.iterator({ keyEncoding: 'view', valueEncoding: 'view' })
    const entries = await it.all()
    const key = Buffer.isBuffer(entries[0][0]) ? Buffer.from(cow) : cow // Valid, Buffer is a Uint8Array
    const value = Buffer.isBuffer(entries[0][1]) ? Buffer.from(cow) : cow

    t.same(entries, [[key, value]])
    return db.close()
  })

  test('put() as view, iterate as string', async function (t) {
    const db = testCommon.factory({ keyEncoding: 'view', valueEncoding: 'view' })
    const cow = textEncoder.encode('🐄')
    await db.open()
    await db.put(cow, cow)

    const it = db.iterator({ keyEncoding: 'utf8', valueEncoding: 'utf8' })
    const entries = await it.all()

    t.same(entries, [['🐄', '🐄']])
    return db.close()
  })

  // NOTE: adapted from levelup
  test('batch() with multiple puts with buffer valueEncoding per batch', async function (t) {
    const db = testCommon.factory()
    await db.open()
    await db.batch([
      { type: 'put', key: 'foo', value: testBuffer() },
      { type: 'put', key: 'bar', value: testBuffer() },
      { type: 'put', key: 'baz', value: 'abazvalue' }
    ], { valueEncoding: 'buffer' })

    t.same(await db.get('foo', { valueEncoding: 'buffer' }), testBuffer())
    t.same(await db.get('bar', { valueEncoding: 'buffer' }), testBuffer())
    t.same(await db.get('baz', { valueEncoding: 'buffer' }), Buffer.from('abazvalue'))

    return db.close()
  })

  test('batch() with multiple puts with buffer valueEncoding per operation', async function (t) {
    const db = testCommon.factory()
    await db.open()
    await db.batch([
      { type: 'put', key: 'foo', value: testBuffer(), valueEncoding: 'buffer' },
      { type: 'put', key: 'bar', value: testBuffer(), valueEncoding: 'buffer' },
      { type: 'put', key: 'baz', value: 'abazvalue', valueEncoding: 'buffer' }
    ])

    t.same(await db.get('foo', { valueEncoding: 'buffer' }), testBuffer())
    t.same(await db.get('bar', { valueEncoding: 'buffer' }), testBuffer())
    t.same(await db.get('baz', { valueEncoding: 'buffer' }), Buffer.from('abazvalue'))

    return db.close()
  })

  // NOTE: adapted from encoding-down
  test('batch() with buffer encoding in factory', async function (t) {
    const operations = [{
      type: 'put',
      key: Buffer.from([1, 2, 3]),
      value: Buffer.from([4, 5, 6])
    }, {
      type: 'put',
      key: Buffer.from([7, 8, 9]),
      value: Buffer.from([10, 11, 12])
    }]

    const db = testCommon.factory({ keyEncoding: 'buffer', valueEncoding: 'buffer' })
    await db.open()
    await db.batch(operations)

    t.same(await db.get(operations[0].key), operations[0].value)
    t.same(await db.get(operations[1].key), operations[1].value)

    return db.close()
  })

  for (const keyEncoding of ['buffer', 'view']) {
    // NOTE: adapted from memdown
    test(`storage is byte-aware (${keyEncoding} encoding)`, async function (t) {
      const db = testCommon.factory({ keyEncoding })
      await db.open()

      // These are equal when compared as strings but not when compared as buffers
      const one = Buffer.from('80', 'hex')
      const two = Buffer.from('c0', 'hex')

      await db.put(one, 'one')
      t.is(await db.get(one), 'one', 'value one ok')

      await db.put(two, 'two')
      t.is(await db.get(one), 'one', 'value one did not change')

      return db.close()
    })

    if (testCommon.supports.getSync) {
      test(`storage is byte-aware (${keyEncoding} encoding) (sync)`, async function (t) {
        const db = testCommon.factory({ keyEncoding })
        await db.open()

        // These are equal when compared as strings but not when compared as buffers
        const one = Buffer.from('80', 'hex')
        const two = Buffer.from('c0', 'hex')

        await db.put(one, 'one')
        t.is(db.getSync(one), 'one', 'value one ok')

        await db.put(two, 'two')
        t.is(db.getSync(one), 'one', 'value one did not change')

        return db.close()
      })
    }

    test(`respects buffer offset and length (${keyEncoding} encoding)`, async function (t) {
      const db = testCommon.factory({ keyEncoding })
      await db.open()

      const a = Buffer.from('000102', 'hex')
      const b = a.subarray(1) // 0102
      const c = a.subarray(0, 1) // 00

      await db.put(a, 'a')
      await db.put(b, 'b')
      await db.put(c, 'c')

      t.is(await db.get(a), 'a', 'value a ok')
      t.is(await db.get(b), 'b', 'value b ok')
      t.is(await db.get(c), 'c', 'value c ok')

      return db.close()
    })

    if (testCommon.supports.getSync) {
      test(`respects buffer offset (${keyEncoding} encoding) (sync)`, async function (t) {
        const db = testCommon.factory({ keyEncoding })
        await db.open()

        const a = Buffer.from('000102', 'hex')
        const b = a.subarray(1) // 0102
        const c = a.subarray(0, 1) // 00

        await db.put(a, 'a')
        await db.put(b, 'b')
        await db.put(c, 'c')

        t.is(db.getSync(a), 'a', 'value a ok')
        t.is(db.getSync(b), 'b', 'value b ok')
        t.is(db.getSync(c), 'c', 'value c ok')

        return db.close()
      })
    }
  }
}

function testBuffer () {
  return Buffer.from('0080c0ff', 'hex')
}
