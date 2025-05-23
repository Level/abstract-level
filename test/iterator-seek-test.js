'use strict'

const { Buffer } = require('buffer')
const identity = (v) => v

exports.all = function (test, testCommon) {
  exports.sequence(test, testCommon)
  exports.seek(test, testCommon)
}

exports.sequence = function (test, testCommon) {
  for (const deferred of [false, true]) {
    for (const mode of ['iterator', 'keys', 'values']) {
      test(`${mode}().seek() throws if next() has not completed (deferred: ${deferred})`, async function (t) {
        const db = testCommon.factory()
        if (!deferred) await db.open()

        const it = db[mode]()
        const promise = it.next()

        t.throws(() => it.seek('two'), (err) => err.code === 'LEVEL_ITERATOR_BUSY')

        await promise
        await db.close()
      })

      test(`${mode}().seek() does not throw after close() (deferred: ${deferred})`, async function (t) {
        const db = testCommon.factory()
        if (!deferred) await db.open()

        const it = db[mode]()
        await it.close()

        t.doesNotThrow(() => it.seek('two'))

        await db.close()
      })
    }
  }
}

exports.seek = function (test, testCommon) {
  const testData = () => [
    // Note that 'three' sorts before 'two'
    { type: 'put', key: 'one', value: '1' },
    { type: 'put', key: 'two', value: '2' },
    { type: 'put', key: 'three', value: '3' }
  ]

  const bufferTestData = () => [
    // Note that 'b9' sorts before 'c0'
    { type: 'put', key: Buffer.from('80', 'hex'), value: '1', keyEncoding: 'buffer' },
    { type: 'put', key: Buffer.from('c0', 'hex'), value: '2', keyEncoding: 'buffer' },
    { type: 'put', key: Buffer.from('b9', 'hex'), value: '3', keyEncoding: 'buffer' }
  ]

  test('prepare byte-aware tests', function (t) {
    const data = bufferTestData()
    t.ok(data[0].key.toString() === data[1].key.toString(), 'would be equal when not byte-aware')
    t.ok(data[0].key.compare(data[1].key) < 0, 'but less than when byte-aware')
    t.end()
  })

  for (const mode of ['iterator', 'keys', 'values']) {
    const mapEntry = mode === 'iterator' ? e => e : mode === 'keys' ? e => e[0] : e => e[1]

    test(`${mode}().seek() to string target`, async function (t) {
      const db = testCommon.factory()
      await db.batch(testData())
      const it = db[mode]()

      it.seek('two')

      t.same(await it.next(), mapEntry(['two', '2']), 'match')
      t.same(await it.next(), undefined, 'end of iterator')

      return db.close()
    })

    if (testCommon.supports.encodings.buffer) {
      test(`${mode}().seek() to buffer target`, async function (t) {
        // For this test to be meaningful it must use bytes outside the utf8 range
        const data = bufferTestData()
        const db = testCommon.factory()
        await db.batch(data)
        const it = db[mode]({ keyEncoding: 'buffer' })

        // Seek to second key
        it.seek(data[1].key)

        t.same(await it.next(), mapEntry([data[1].key, '2']), 'match')
        t.same(await it.next(), undefined, 'end of iterator')

        return db.close()
      })
    }

    test(`${mode}().seek() to target with custom encoding`, async function (t) {
      const db = testCommon.factory()
      await db.batch(testData())
      const it = db[mode]()
      const keyEncoding = { encode: () => 'two', decode: identity, format: 'utf8' }

      it.seek('xyz', { keyEncoding })

      t.same(await it.next(), mapEntry(['two', '2']), 'match')
      t.same(await it.next(), undefined, 'end of iterator')

      return db.close()
    })

    test(`${mode}().seek() on reverse iterator`, async function (t) {
      const db = testCommon.factory()
      await db.batch(testData())
      const it = db[mode]({ reverse: true, limit: 1 })

      // Should land on key equal to or smaller than 'three!' which is 'three'
      it.seek('three!')

      t.same(await it.next(), mapEntry(['three', '3']), 'match')
      t.same(await it.next(), undefined, 'end of iterator')

      return db.close()
    })

    test(`${mode}().seek() to out of range target`, async function (t) {
      const db = testCommon.factory()
      await db.batch(testData())
      const it = db[mode]()

      it.seek('zzz')
      t.same(await it.next(), undefined, 'end of iterator')

      return db.close()
    })

    test(`${mode}().seek() on reverse iterator to out of range target`, async function (t) {
      const db = testCommon.factory()
      await db.batch(testData())
      const it = db[mode]({ reverse: true })

      it.seek('zzz')

      t.same(await it.next(), mapEntry(['two', '2']), 'match')
      t.same(await it.next(), mapEntry(['three', '3']), 'match')
      t.same(await it.next(), mapEntry(['one', '1']), 'match')
      t.same(await it.next(), undefined, 'end of iterator')

      return db.close()
    })

    test(`${mode}().seek() can be used to iterate twice`, async function (t) {
      const db = testCommon.factory()
      await db.batch(testData())
      const it = db[mode]()

      t.same(await it.nextv(10), [['one', '1'], ['three', '3'], ['two', '2']].map(mapEntry), 'match')
      t.same(await it.nextv(10), [], 'end of iterator')

      it.seek('one')

      t.same(await it.nextv(10), [['one', '1'], ['three', '3'], ['two', '2']].map(mapEntry), 'match again')
      t.same(await it.nextv(10), [], 'end of iterator again')

      await it.close()
      return db.close()
    })

    test(`${mode}().seek() can be used to iterate twice, within limit`, async function (t) {
      const db = testCommon.factory()
      await db.batch(testData())
      const limit = 4
      const it = db[mode]({ limit })

      t.same(await it.nextv(10), [['one', '1'], ['three', '3'], ['two', '2']].map(mapEntry), 'match')
      t.same(await it.nextv(10), [], 'end of iterator')

      it.seek('one')

      t.same(await it.nextv(10), [['one', '1']].map(mapEntry), 'limit reached')
      t.same(await it.nextv(10), [], 'end of iterator')

      it.seek('one')
      t.same(await it.nextv(10), [], 'does not reset after limit has been reached')

      await it.close()
      return db.close()
    })

    if (testCommon.supports.implicitSnapshots) {
      for (const reverse of [false, true]) {
        for (const deferred of [false, true]) {
          test(`${mode}().seek() respects snapshot (reverse: ${reverse}, deferred: ${deferred})`, async function (t) {
            const db = testCommon.factory()
            if (!deferred) await db.open()

            const it = db[mode]({ reverse })

            // Add entry after having created the iterator (and its snapshot)
            await db.put('a', 'a')

            // Seeking should not create a new snapshot, which'd include the new entry
            it.seek('a')
            t.same(await it.next(), undefined)

            return db.close()
          })
        }
      }
    }

    test(`${mode}().seek() respects range`, async function (t) {
      const db = testCommon.factory()
      await db.open()
      const ops = []

      for (let i = 0; i < 10; i++) {
        ops.push({ type: 'put', key: String(i), value: String(i) })
      }

      await db.batch(ops)
      const promises = []

      expect({ gt: '5' }, '4', undefined)
      expect({ gt: '5' }, '5', undefined)
      expect({ gt: '5' }, '6', '6')

      expect({ gte: '5' }, '4', undefined)
      expect({ gte: '5' }, '5', '5')
      expect({ gte: '5' }, '6', '6')

      // The gte option should take precedence over gt.
      expect({ gte: '5', gt: '7' }, '4', undefined)
      expect({ gte: '5', gt: '7' }, '5', '5')
      expect({ gte: '5', gt: '7' }, '6', '6')
      expect({ gte: '5', gt: '3' }, '4', undefined)
      expect({ gte: '5', gt: '3' }, '5', '5')
      expect({ gte: '5', gt: '3' }, '6', '6')

      expect({ lt: '5' }, '4', '4')
      expect({ lt: '5' }, '5', undefined)
      expect({ lt: '5' }, '6', undefined)

      expect({ lte: '5' }, '4', '4')
      expect({ lte: '5' }, '5', '5')
      expect({ lte: '5' }, '6', undefined)

      // The lte option should take precedence over lt.
      expect({ lte: '5', lt: '3' }, '4', '4')
      expect({ lte: '5', lt: '3' }, '5', '5')
      expect({ lte: '5', lt: '3' }, '6', undefined)
      expect({ lte: '5', lt: '7' }, '4', '4')
      expect({ lte: '5', lt: '7' }, '5', '5')
      expect({ lte: '5', lt: '7' }, '6', undefined)

      expect({ lt: '5', reverse: true }, '4', '4')
      expect({ lt: '5', reverse: true }, '5', undefined)
      expect({ lt: '5', reverse: true }, '6', undefined)

      expect({ lte: '5', reverse: true }, '4', '4')
      expect({ lte: '5', reverse: true }, '5', '5')
      expect({ lte: '5', reverse: true }, '6', undefined)

      expect({ gt: '5', reverse: true }, '4', undefined)
      expect({ gt: '5', reverse: true }, '5', undefined)
      expect({ gt: '5', reverse: true }, '6', '6')

      expect({ gte: '5', reverse: true }, '4', undefined)
      expect({ gte: '5', reverse: true }, '5', '5')
      expect({ gte: '5', reverse: true }, '6', '6')

      expect({ gt: '7', lt: '8' }, '7', undefined)
      expect({ gte: '7', lt: '8' }, '7', '7')
      expect({ gte: '7', lt: '8' }, '8', undefined)
      expect({ gt: '7', lte: '8' }, '8', '8')

      await Promise.all(promises)
      return db.close()

      function expect (range, target, expected) {
        promises.push(async function () {
          const ite = db[mode](range)
          ite.seek(target)

          const item = await ite.next()
          const json = JSON.stringify(range)
          const msg = 'seek(' + target + ') on ' + json + ' yields ' + expected

          // Either a key or value depending on mode
          t.is(mode === 'iterator' ? item[0] : item, expected, msg)

          return ite.close()
        })
      }
    })

    // Tests the specific case where an iterator can (theoretically) tell that
    // a seek() would be out of range by comparing the seek target against
    // range options, before performing an actual seek. MemoryLevel works this
    // way for example. Also test the same scenario without an explicit seek()
    // which should have the same result.
    for (const reverse of [false, true]) {
      for (const seek of [true, false]) {
        const props = `reverse = ${reverse}, seek = ${seek}`
        const name = `${mode}() seek outside of range options (${props})`
        const key = 'a'

        test(name, async function (t) {
          const db = testCommon.factory()

          await db.open()
          await db.put(key, '123')

          // Pick ranges that exclude the key
          const ranges = [
            { gt: 'x', reverse },
            { gte: 'x', reverse },
            { lt: '0', reverse },
            { lte: '0', reverse }
          ]

          // Test each range
          for (let i = 0; i < ranges.length; i++) {
            const iterator = db[mode](ranges[i])
            if (seek) iterator.seek(key)
            t.same(await iterator.next(), undefined, `end of iterator ${i}`)
            await iterator.close()
          }

          return db.close()
        })
      }
    }
  }
}
