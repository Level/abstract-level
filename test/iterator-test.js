'use strict'

const { Buffer } = require('buffer')
const identity = (v) => v

let db

exports.setUp = function (test, testCommon) {
  test('iterator setup', async function (t) {
    db = testCommon.factory()
    return db.open()
  })
}

exports.args = function (test, testCommon) {
  for (const mode of ['iterator', 'keys', 'values']) {
    test(`${mode}() has db reference`, async function (t) {
      const it = db[mode]()

      // May return iterator of an underlying db, that's okay.
      t.ok(it.db === db || it.db === (db.db || db._db || db))

      await it.close()
    })

    test(`${mode}() has limit and count properties`, async function (t) {
      const iterators = [db[mode]()]
      t.is(iterators[0].limit, Infinity, 'defaults to infinite')

      for (const limit of [-1, 0, 1, Infinity]) {
        const it = db[mode]({ limit })
        iterators.push(it)
        t.is(it.limit, limit === -1 ? Infinity : limit, 'has limit property')
      }

      t.ok(iterators.every(it => it.count === 0), 'has count property')
      await Promise.all(iterators.map(it => it.close()))
    })

    test(`${mode}().nextv() yields error if size is invalid`, async function (t) {
      t.plan(4)

      const it = db[mode]()

      for (const args of [[], [NaN], ['1'], [2.5]]) {
        try {
          await it.nextv(...args)
        } catch (err) {
          t.is(err.message, "The first argument 'size' must be an integer")
        }
      }

      await it.close()
    })
  }
}

exports.sequence = function (test, testCommon) {
  for (const mode of ['iterator', 'keys', 'values']) {
    test(`${mode}().close() is idempotent`, async function (t) {
      const iterator = db[mode]()

      await iterator.close()
      await iterator.close()

      return Promise.all([iterator.close(), iterator.close()])
    })

    for (const method of ['next', 'nextv', 'all']) {
      const requiredArgs = method === 'nextv' ? [1] : []

      test(`${mode}().${method}() after close() yields error`, async function (t) {
        t.plan(1)

        const iterator = db[mode]()
        await iterator.close()

        try {
          await iterator[method](...requiredArgs)
        } catch (err) {
          t.is(err.code, 'LEVEL_ITERATOR_NOT_OPEN', 'correct message')
        }
      })

      for (const otherMethod of ['next', 'nextv', 'all']) {
        const otherRequiredArgs = otherMethod === 'nextv' ? [1] : []

        test(`${mode}().${method}() while busy with ${otherMethod}() yields error`, async function (t) {
          t.plan(1)

          const iterator = db[mode]()
          const promise = iterator[otherMethod](...otherRequiredArgs)

          try {
            await iterator[method](...requiredArgs)
          } catch (err) {
            t.is(err.code, 'LEVEL_ITERATOR_BUSY')
          }

          await promise
          return iterator.close()
        })
      }

      for (const deferred of [false, true]) {
        test(`${mode}().${method}() during close() yields error (deferred: ${deferred})`, async function (t) {
          t.plan(2)

          const db = testCommon.factory()
          if (!deferred) await db.open()
          const it = db[mode]()

          // The first call *may* succeed, because it was scheduled before close(). The
          // default implementations of nextv() and all() fallback to next*() and thus
          // make multiple calls, so they're allowed to fail.
          let promise = it[method](...requiredArgs).then(() => {
            t.pass('Optionally succeeded')
          }, (err) => {
            t.is(err.code, 'LEVEL_ITERATOR_NOT_OPEN')
          })

          // The second call *must* fail, because it was scheduled after close()
          promise = promise.then(() => {
            return it[method](...requiredArgs).then(() => {
              t.fail('Expected an error')
            }, (err) => {
              t.is(err.code, 'LEVEL_ITERATOR_NOT_OPEN')
            })
          })

          await Promise.all([it.close(), promise])
          return db.close()
        })
      }

      // 1) At the moment, we can only be sure that signals are supported if the iterator is deferred
      if (globalThis.AbortController) {
        test(`${mode}().${method}() with aborted signal yields error (deferred)`, async function (t) {
          t.plan(3)

          const db = testCommon.factory()
          const ac = new globalThis.AbortController()
          const it = db[mode]({ signal: ac.signal })

          t.is(db.status, 'opening', 'is deferred')
          ac.abort()

          try {
            await it[method](...requiredArgs)
          } catch (err) {
            t.is(err.code, 'LEVEL_ABORTED')
            t.is(err.name, 'AbortError')
          }

          await it.close()
          return db.close()
        })
      }

      // 2) Unless the implementation opts-in
      if (globalThis.AbortController && testCommon.supports.signals && testCommon.supports.signals.iterators) {
        test(`${mode}().${method}() with signal yields error when aborted`, async function (t) {
          t.plan(2)

          const db = testCommon.factory()

          await db.open()
          await db.batch().put('a', 'a').put('b', 'b').write()

          const ac = new globalThis.AbortController()
          const it = db[mode]({ signal: ac.signal })
          const promise = it[method](...requiredArgs)

          ac.abort()

          try {
            await promise
          } catch (err) {
            t.is(err.code, 'LEVEL_ABORTED')
            t.is(err.name, 'AbortError')
          }

          await it.close()
          return db.close()
        })

        test(`${mode}().${method}() with non-aborted signal`, async function (t) {
          const db = testCommon.factory()

          await db.open()
          await db.batch().put('a', 'a').put('b', 'b').write()

          const ac = new globalThis.AbortController()
          const it = db[mode]({ signal: ac.signal })

          // We're merely testing that this does not throw. And implicitly testing (through
          // coverage) that abort listeners are removed. An implementation might choose to
          // periodically check signal.aborted instead of using an abort listener, so we
          // can't directly assert that cleanup indeed happens.
          await it[method](...requiredArgs)
          await it.close()

          return db.close()
        })
      }
    }
  }
}

exports.iterator = function (test, testCommon) {
  test('iterator data setup', function (t) {
    return db.batch([
      { type: 'put', key: 'foobatch1', value: 'bar1' },
      { type: 'put', key: 'foobatch2', value: 'bar2' },
      { type: 'put', key: 'foobatch3', value: 'bar3' }
    ])
  })

  test('simple iterator().next()', async function (t) {
    const iterator = db.iterator()

    t.same(await iterator.next(), ['foobatch1', 'bar1'])
    t.same(await iterator.next(), ['foobatch2', 'bar2'])
    t.same(await iterator.next(), ['foobatch3', 'bar3'])
    t.is(await iterator.next(), undefined)

    return iterator.close()
  })

  // NOTE: adapted from leveldown
  test('iterator().next() with values: false', async function (t) {
    const it = db.iterator({ values: false })

    t.same(await it.next(), ['foobatch1', undefined])
    t.same(await it.next(), ['foobatch2', undefined])
    t.same(await it.next(), ['foobatch3', undefined])
    t.is(await it.next(), undefined)

    return it.close()
  })

  // NOTE: adapted from leveldown
  test('iterator().next() with keys: false', async function (t) {
    const it = db.iterator({ keys: false })

    t.same(await it.next(), [undefined, 'bar1'])
    t.same(await it.next(), [undefined, 'bar2'])
    t.same(await it.next(), [undefined, 'bar3'])
    t.is(await it.next(), undefined)

    return it.close()
  })

  test('keys().next()', async function (t) {
    const it = db.keys()

    t.is(await it.next(), 'foobatch1')
    t.is(await it.next(), 'foobatch2')
    t.is(await it.next(), 'foobatch3')
    t.is(await it.next(), undefined)

    return it.close()
  })

  test('values().next()', async function (t) {
    const it = db.values()

    t.is(await it.next(), 'bar1')
    t.is(await it.next(), 'bar2')
    t.is(await it.next(), 'bar3')
    t.is(await it.next(), undefined)

    return it.close()
  })

  for (const mode of ['iterator', 'keys', 'values']) {
    const mapEntry = e => mode === 'iterator' ? e : mode === 'keys' ? e[0] : e[1]

    test(`${mode}().nextv()`, async function (t) {
      const it = db[mode]()

      t.same(await it.nextv(1), [['foobatch1', 'bar1']].map(mapEntry))
      t.same(await it.nextv(2, {}), [['foobatch2', 'bar2'], ['foobatch3', 'bar3']].map(mapEntry))
      t.same(await it.nextv(2), [])

      await it.close()
    })

    test(`${mode}().nextv() in reverse`, async function (t) {
      const it = db[mode]({ reverse: true })

      t.same(await it.nextv(1), [['foobatch3', 'bar3']].map(mapEntry))
      t.same(await it.nextv(2, {}), [['foobatch2', 'bar2'], ['foobatch1', 'bar1']].map(mapEntry))
      t.same(await it.nextv(2), [])

      await it.close()
    })

    test(`${mode}().nextv() has soft minimum of 1`, async function (t) {
      const it = db[mode]()

      t.same(await it.nextv(0), [['foobatch1', 'bar1']].map(mapEntry))
      t.same(await it.nextv(0), [['foobatch2', 'bar2']].map(mapEntry))
      t.same(await it.nextv(0, {}), [['foobatch3', 'bar3']].map(mapEntry))
      t.same(await it.nextv(0), [])

      await it.close()
    })

    test(`${mode}().nextv() requesting more than available`, async function (t) {
      const it = db[mode]()

      t.same(await it.nextv(10), [
        ['foobatch1', 'bar1'],
        ['foobatch2', 'bar2'],
        ['foobatch3', 'bar3']
      ].map(mapEntry))
      t.same(await it.nextv(10), [])

      await it.close()
    })

    test(`${mode}().nextv() honors limit`, async function (t) {
      const it = db[mode]({ limit: 2 })

      t.same(await it.nextv(10), [['foobatch1', 'bar1'], ['foobatch2', 'bar2']].map(mapEntry))
      t.same(await it.nextv(10), [])

      await it.close()
    })

    test(`${mode}().nextv() honors limit and size`, async function (t) {
      const it = db[mode]({ limit: 2 })

      t.same(await it.nextv(1), [['foobatch1', 'bar1']].map(mapEntry))
      t.same(await it.nextv(10), [['foobatch2', 'bar2']].map(mapEntry))
      t.same(await it.nextv(10), [])

      await it.close()
    })

    test(`${mode}().nextv() honors limit in reverse`, async function (t) {
      const it = db[mode]({ limit: 2, reverse: true })

      t.same(await it.nextv(10), [['foobatch3', 'bar3'], ['foobatch2', 'bar2']].map(mapEntry))
      t.same(await it.nextv(10), [])

      await it.close()
    })

    test(`${mode}().nextv() honors limit and size in reverse`, async function (t) {
      const it = db[mode]({ limit: 2, reverse: true })

      t.same(await it.nextv(1), [['foobatch3', 'bar3']].map(mapEntry))
      t.same(await it.nextv(10), [['foobatch2', 'bar2']].map(mapEntry))
      t.same(await it.nextv(10), [])

      await it.close()
    })

    test(`${mode}().all()`, async function (t) {
      t.same(await db[mode]().all(), [
        ['foobatch1', 'bar1'],
        ['foobatch2', 'bar2'],
        ['foobatch3', 'bar3']
      ].map(mapEntry))

      t.same(await db[mode]().all({}), [
        ['foobatch1', 'bar1'],
        ['foobatch2', 'bar2'],
        ['foobatch3', 'bar3']
      ].map(mapEntry))
    })

    test(`${mode}().all() with keys: false`, async function (t) {
      // keys option should be ignored on db.keys() and db.values()
      t.same(await db[mode]({ keys: false }).all(), [
        [mode === 'iterator' ? undefined : 'foobatch1', 'bar1'],
        [mode === 'iterator' ? undefined : 'foobatch2', 'bar2'],
        [mode === 'iterator' ? undefined : 'foobatch3', 'bar3']
      ].map(mapEntry))
    })

    test(`${mode}().all() with values: false`, async function (t) {
      // values option should be ignored on db.keys() and db.values()
      t.same(await db[mode]({ values: false }).all(), [
        ['foobatch1', mode === 'iterator' ? undefined : 'bar1'],
        ['foobatch2', mode === 'iterator' ? undefined : 'bar2'],
        ['foobatch3', mode === 'iterator' ? undefined : 'bar3']
      ].map(mapEntry))
    })

    test(`${mode}().all() in reverse`, async function (t) {
      t.same(await db[mode]({ reverse: true }).all(), [
        ['foobatch3', 'bar3'],
        ['foobatch2', 'bar2'],
        ['foobatch1', 'bar1']
      ].map(mapEntry))
    })

    test(`${mode}().all() honors limit`, async function (t) {
      t.same(await db[mode]({ limit: 2 }).all(), [
        ['foobatch1', 'bar1'],
        ['foobatch2', 'bar2']
      ].map(mapEntry))

      const it = db[mode]({ limit: 2 })

      t.same(await it.next(), mapEntry(['foobatch1', 'bar1']))
      t.same(await it.all(), [['foobatch2', 'bar2']].map(mapEntry))
    })

    test(`${mode}().all() honors limit in reverse`, async function (t) {
      t.same(await db[mode]({ limit: 2, reverse: true }).all(), [
        ['foobatch3', 'bar3'],
        ['foobatch2', 'bar2']
      ].map(mapEntry))

      const it = db[mode]({ limit: 2, reverse: true })

      t.same(await it.next(), mapEntry(['foobatch3', 'bar3']))
      t.same(await it.all(), [['foobatch2', 'bar2']].map(mapEntry))
    })
  }

  // NOTE: adapted from memdown
  test('iterator() sorts lexicographically', async function (t) {
    const db = testCommon.factory()
    await db.open()

    // Write in unsorted order with multiple operations
    await db.put('f', 'F')
    await db.put('a', 'A')
    await db.put('~', '~')
    await db.put('e', 'E')
    await db.put('🐄', '🐄')
    await db.batch([
      { type: 'put', key: 'd', value: 'D' },
      { type: 'put', key: 'b', value: 'B' },
      { type: 'put', key: 'ff', value: 'FF' },
      { type: 'put', key: 'a🐄', value: 'A🐄' }
    ])
    await db.batch([
      { type: 'put', key: '', value: 'empty' },
      { type: 'put', key: '2', value: '2' },
      { type: 'put', key: '12', value: '12' },
      { type: 'put', key: '\t', value: '\t' }
    ])

    t.same(await db.iterator().all(), [
      ['', 'empty'],
      ['\t', '\t'],
      ['12', '12'],
      ['2', '2'],
      ['a', 'A'],
      ['a🐄', 'A🐄'],
      ['b', 'B'],
      ['d', 'D'],
      ['e', 'E'],
      ['f', 'F'],
      ['ff', 'FF'],
      ['~', '~'],
      ['🐄', '🐄']
    ])

    t.same(await db.iterator({ lte: '' }).all(), [
      ['', 'empty']
    ])

    return db.close()
  })

  for (const keyEncoding of ['buffer', 'view']) {
    if (!testCommon.supports.encodings[keyEncoding]) continue

    test(`iterators have byte order (${keyEncoding} encoding)`, async function (t) {
      const db = testCommon.factory({ keyEncoding })
      await db.open()

      const ctor = keyEncoding === 'buffer' ? Buffer : Uint8Array
      const bytes = [2, 11, 1]
      const keys = bytes.map(b => ctor.from([b]))
      const values = bytes.map(b => String(b))

      await db.batch(keys.map((key, i) => ({ type: 'put', key, value: values[i] })))

      t.same((await db.keys().all()).map(k => k[0]), [1, 2, 11], 'order of keys() is ok')
      t.same((await db.iterator().all()).map(e => e[0][0]), [1, 2, 11], 'order of iterator() is ok')
      t.same(await db.values().all(), ['1', '2', '11'], 'order of values() is ok')

      return db.close()
    })

    // NOTE: adapted from memdown and level-js
    test(`iterator() with byte range (${keyEncoding} encoding)`, async function (t) {
      const db = testCommon.factory({ keyEncoding })
      await db.open()

      await db.put(Uint8Array.from([0x0]), '0')
      await db.put(Uint8Array.from([128]), '128')
      await db.put(Uint8Array.from([160]), '160')
      await db.put(Uint8Array.from([192]), '192')

      const collect = async (range) => {
        const entries = await db.iterator(range).all()
        t.ok(entries.every(e => e[0] instanceof Uint8Array)) // True for both encodings
        t.ok(entries.every(e => e[1] === String(e[0][0])))
        return entries.map(e => e[0][0])
      }

      t.same(await collect({ gt: Uint8Array.from([255]) }), [])
      t.same(await collect({ gt: Uint8Array.from([192]) }), [])
      t.same(await collect({ gt: Uint8Array.from([160]) }), [192])
      t.same(await collect({ gt: Uint8Array.from([128]) }), [160, 192])
      t.same(await collect({ gt: Uint8Array.from([0x0]) }), [128, 160, 192])
      t.same(await collect({ gt: Uint8Array.from([]) }), [0x0, 128, 160, 192])

      t.same(await collect({ lt: Uint8Array.from([255]) }), [0x0, 128, 160, 192])
      t.same(await collect({ lt: Uint8Array.from([192]) }), [0x0, 128, 160])
      t.same(await collect({ lt: Uint8Array.from([160]) }), [0x0, 128])
      t.same(await collect({ lt: Uint8Array.from([128]) }), [0x0])
      t.same(await collect({ lt: Uint8Array.from([0x0]) }), [])
      t.same(await collect({ lt: Uint8Array.from([]) }), [])

      t.same(await collect({ gte: Uint8Array.from([255]) }), [])
      t.same(await collect({ gte: Uint8Array.from([192]) }), [192])
      t.same(await collect({ gte: Uint8Array.from([160]) }), [160, 192])
      t.same(await collect({ gte: Uint8Array.from([128]) }), [128, 160, 192])
      t.same(await collect({ gte: Uint8Array.from([0x0]) }), [0x0, 128, 160, 192])
      t.same(await collect({ gte: Uint8Array.from([]) }), [0x0, 128, 160, 192])

      t.same(await collect({ lte: Uint8Array.from([255]) }), [0x0, 128, 160, 192])
      t.same(await collect({ lte: Uint8Array.from([192]) }), [0x0, 128, 160, 192])
      t.same(await collect({ lte: Uint8Array.from([160]) }), [0x0, 128, 160])
      t.same(await collect({ lte: Uint8Array.from([128]) }), [0x0, 128])
      t.same(await collect({ lte: Uint8Array.from([0x0]) }), [0x0])
      t.same(await collect({ lte: Uint8Array.from([]) }), [])

      return db.close()
    })
  }
}

exports.decode = function (test, testCommon) {
  for (const deferred of [false, true]) {
    for (const mode of ['iterator', 'keys', 'values']) {
      for (const method of ['next', 'nextv', 'all']) {
        const requiredArgs = method === 'nextv' ? [1] : []

        for (const encodingOption of ['keyEncoding', 'valueEncoding']) {
          if (mode === 'keys' && encodingOption === 'valueEncoding') continue
          if (mode === 'values' && encodingOption === 'keyEncoding') continue

          // NOTE: adapted from encoding-down
          test(`${mode}().${method}() catches decoding error from ${encodingOption} (deferred: ${deferred})`, async function (t) {
            t.plan(4)

            const encoding = {
              format: 'utf8',
              decode: function (x) {
                t.is(x, encodingOption === 'keyEncoding' ? 'testKey' : 'testValue')
                throw new Error('from encoding')
              },
              encode: identity
            }

            const db = testCommon.factory()
            await db.put('testKey', 'testValue')

            if (deferred) {
              await db.close()
              db.open().then(t.pass.bind(t))
            } else {
              t.pass('non-deferred')
            }

            const it = db[mode]({ [encodingOption]: encoding })

            try {
              await it[method](...requiredArgs)
            } catch (err) {
              t.is(err.code, 'LEVEL_DECODE_ERROR')
              t.is(err.cause && err.cause.message, 'from encoding')
            }

            return db.close()
          })
        }
      }
    }
  }
}

exports.tearDown = function (test, testCommon) {
  test('iterator teardown', async function (t) {
    return db.close()
  })
}

exports.dispose = function (test, testCommon) {
  // Can't use the syntax yet (https://github.com/tc39/proposal-explicit-resource-management)
  Symbol.asyncDispose && test('Symbol.asyncDispose', async function (t) {
    const db = testCommon.factory()
    await db.open()

    const iterator = db.iterator()
    await iterator[Symbol.asyncDispose]()

    return db.close()
  })
}

exports.all = function (test, testCommon) {
  exports.setUp(test, testCommon)
  exports.args(test, testCommon)
  exports.sequence(test, testCommon)
  exports.iterator(test, testCommon)
  exports.decode(test, testCommon)
  exports.tearDown(test, testCommon)
  exports.dispose(test, testCommon)
}
