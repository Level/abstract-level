'use strict'

const { Buffer } = require('buffer')

exports.all = function (test, testCommon) {
  for (const deferred of [false, true]) {
    // NOTE: adapted from subleveldown
    test(`sublevel.clear() (deferred: ${deferred})`, async function (t) {
      const db = testCommon.factory()
      const sub1 = db.sublevel('1')
      const sub2 = db.sublevel('2')

      if (!deferred) await sub1.open()
      if (!deferred) await sub2.open()

      await populate([sub1, sub2], ['a', 'b'])
      await verify(['!1!a', '!1!b', '!2!a', '!2!b'])

      await clear([sub1], {})
      await verify(['!2!a', '!2!b'])

      await populate([sub1], ['a', 'b'])
      await clear([sub2], { lt: 'b' })
      await verify(['!1!a', '!1!b', '!2!b'])
      await db.close()

      async function populate (subs, items) {
        return Promise.all(subs.map(sub => {
          return sub.batch(items.map(function (item) {
            return { type: 'put', key: item, value: item }
          }))
        }))
      }

      async function clear (subs, opts) {
        return Promise.all(subs.map(sub => {
          return sub.clear(opts)
        }))
      }

      async function verify (expected) {
        const keys = await db.keys().all()
        t.same(keys, expected)
      }
    })
  }

  for (const method of ['batch', 'chained batch']) {
    test(`${method} with descendant sublevel option`, async function (t) {
      t.plan(25)

      const db = testCommon.factory()
      await db.open()

      const a = db.sublevel('a')
      const b = a.sublevel('b')
      const c = b.sublevel('c')

      await Promise.all([a.open(), b.open(), c.open()])

      // Note: may return a transcoder encoding
      const utf8 = db.keyEncoding('utf8')

      const put = method === 'batch'
        ? (db, key, opts) => db.batch([{ type: 'put', key, value: 'x', ...opts }])
        : (db, key, opts) => db.batch().put(key, key, opts).write()

      const del = method === 'batch'
        ? (db, key, opts) => db.batch([{ type: 'del', key, ...opts }])
        : (db, key, opts) => db.batch().del(key, opts).write()

      // Note: not entirely a noop. Use of sublevel option triggers data to be encoded early
      db.on('write', (ops) => t.same(ops[0].key, utf8.encode('1'), 'got put 1'))
      await put(db, '1', { sublevel: db })

      db.removeAllListeners('write')
      db.on('write', (ops) => t.same(ops[0].key, utf8.encode('!a!2'), 'got put 2'))
      await put(db, '2', { sublevel: a })
      await put(a, '2', { sublevel: a }) // Same

      db.removeAllListeners('write')
      db.on('write', (ops) => t.same(ops[0].key, utf8.encode('!a!!b!3'), 'got put 3'))
      await put(db, '3', { sublevel: b })
      await put(a, '3', { sublevel: b }) // Same
      await put(b, '3', { sublevel: b }) // Same

      db.removeAllListeners('write')
      db.on('write', (ops) => t.same(ops[0].key, utf8.encode('!a!!b!!c!4'), 'got put 4'))
      await put(db, '4', { sublevel: c })
      await put(a, '4', { sublevel: c }) // Same
      await put(b, '4', { sublevel: c }) // Same
      await put(c, '4', { sublevel: c }) // Same

      t.same(await db.keys().all(), ['!a!!b!!c!4', '!a!!b!3', '!a!2', '1'], 'db has entries')
      t.same(await a.keys().all(), ['!b!!c!4', '!b!3', '2'], 'sublevel a has entries')
      t.same(await b.keys().all(), ['!c!4', '3'], 'sublevel b has entries')
      t.same(await c.keys().all(), ['4'], 'sublevel c has entries')

      // Test deletes
      db.removeAllListeners('write')
      db.on('write', (ops) => t.same(ops[0].key, utf8.encode('1'), 'got del 1'))
      await del(db, '1', { sublevel: db })

      db.removeAllListeners('write')
      db.on('write', (ops) => t.same(ops[0].key, utf8.encode('!a!2'), 'got del 2'))
      await del(db, '2', { sublevel: a })
      await del(a, '2', { sublevel: a }) // Same

      db.removeAllListeners('write')
      db.on('write', (ops) => t.same(ops[0].key, utf8.encode('!a!!b!3'), 'got del 3'))
      await del(db, '3', { sublevel: b })
      await del(a, '3', { sublevel: b }) // Same
      await del(b, '3', { sublevel: b }) // Same

      db.removeAllListeners('write')
      db.on('write', (ops) => t.same(ops[0].key, utf8.encode('!a!!b!!c!4'), 'got del 4'))
      await del(db, '4', { sublevel: c })
      await del(a, '4', { sublevel: c }) // Same
      await del(b, '4', { sublevel: c }) // Same
      await del(c, '4', { sublevel: c }) // Same

      t.same(await db.keys().all(), [], 'db has no entries')
      return db.close()
    })

    // See https://github.com/Level/abstract-level/issues/80
    test(`${method} with nondescendant sublevel option`, async function (t) {
      const db = testCommon.factory()
      await db.open()

      const a = db.sublevel('a')
      const b = db.sublevel('b')

      await Promise.all([a.open(), b.open()])

      // The b sublevel is not a descendant of a, so the sublevel option
      // has to be forwarded to db so that the key gets the correct prefix.
      if (method === 'batch') {
        await a.batch([{ type: 'put', key: 'k', value: 'v', sublevel: b }])
      } else {
        await a.batch().put('k', 'v', { sublevel: b }).write()
      }

      t.same(await db.keys().all(), ['!b!k'], 'written to sublevel b')
    })
  }

  for (const deferred of [false, true]) {
    for (const keyEncoding of ['buffer', 'view']) {
      if (!testCommon.supports.encodings[keyEncoding]) continue

      // NOTE: adapted from subleveldown. See https://github.com/Level/subleveldown/issues/87
      test(`iterate sublevel keys with bytes above 196 (${keyEncoding}, deferred: ${deferred})`, async function (t) {
        const db = testCommon.factory()
        const sub1 = db.sublevel('a', { keyEncoding })
        const sub2 = db.sublevel('b', { keyEncoding })
        const length = (db) => db.keys().all().then(x => x.length)

        if (!deferred) await sub1.open()
        if (!deferred) await sub2.open()

        const batch1 = []
        const batch2 = []
        const keys = []

        // TODO: write before creating the sublevels, to make the deferred test more meaningful
        for (let i = 0; i < 256; i++) {
          const key = keyEncoding === 'buffer' ? Buffer.from([i]) : new Uint8Array([i])
          keys.push(key)
          batch1.push({ type: 'put', key, value: 'aa' })
          batch2.push({ type: 'put', key, value: 'bb' })
        }

        await Promise.all([sub1.batch(batch1), sub2.batch(batch2)])

        const entries1 = await sub1.iterator().all()
        const entries2 = await sub2.iterator().all()

        t.is(entries1.length, 256, 'sub1 yielded all entries')
        t.is(entries2.length, 256, 'sub2 yielded all entries')
        t.ok(entries1.every(x => x[1] === 'aa'))
        t.ok(entries2.every(x => x[1] === 'bb'))

        const many1 = await sub1.getMany(keys)
        const many2 = await sub2.getMany(keys)

        t.is(many1.length, 256, 'sub1 yielded all values')
        t.is(many2.length, 256, 'sub2 yielded all values')
        t.ok(many1.every(x => x === 'aa'))
        t.ok(many2.every(x => x === 'bb'))

        const singles1 = await Promise.all(keys.map(k => sub1.get(k)))
        const singles2 = await Promise.all(keys.map(k => sub2.get(k)))

        t.is(singles1.length, 256, 'sub1 yielded all values')
        t.is(singles2.length, 256, 'sub2 yielded all values')
        t.ok(singles1.every(x => x === 'aa'))
        t.ok(singles2.every(x => x === 'bb'))

        await sub1.clear()

        t.same(await length(sub1), 0, 'cleared sub1')
        t.same(await length(sub2), 256, 'did not clear sub2')

        await db.close()
      })
    }
  }
}
