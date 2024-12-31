'use strict'

module.exports = function (test, testCommon) {
  for (const deferred of [false, true]) {
    // Chained batch does not support deferred open
    const batchMethods = deferred ? ['batch'] : ['batch', 'chained batch']
    const allMethods = batchMethods.concat(['singular'])

    for (const method of allMethods) {
      // db.put() and db.del() do not support the sublevel option
      for (const withSublevel of (method === 'singular' ? [false] : [false, true])) {
        test(`db emits write event for ${method} put operation (deferred: ${deferred}, sublevel: ${withSublevel})`, async function (t) {
          t.plan(1)

          const db = testCommon.factory()
          const sublevel = withSublevel ? db.sublevel('abc') : null

          if (!deferred) {
            await db.open()
            if (withSublevel) await sublevel.open()
          }

          // Note: may return a transcoder encoding, which unfortunately makes the below
          // assertions a little less precise (i.e. we can't compare output data). But
          // in places where we expect encoded data, we can use strings (rather than
          // numbers) as the input to encode(), which'll tell us that encoding did happen.
          const dbEncoding = db.keyEncoding('utf8')
          const subEncoding = withSublevel ? sublevel.keyEncoding('utf8') : null

          db.on('write', function (ops) {
            t.same(ops, [
              {
                type: 'put',
                key: withSublevel ? sublevel.prefixKey(subEncoding.encode('456'), subEncoding.format, true) : 456,
                value: withSublevel ? subEncoding.encode('99') : 99,
                keyEncoding: db.keyEncoding(withSublevel ? subEncoding.format : 'utf8'),
                valueEncoding: db.valueEncoding(withSublevel ? subEncoding.format : 'utf8'),
                encodedKey: withSublevel ? sublevel.prefixKey(subEncoding.encode('456'), subEncoding.format, true) : dbEncoding.encode('456'),
                encodedValue: (withSublevel ? subEncoding : dbEncoding).encode('99'),
                custom: 123,
                sublevel: null // Should be unset
              }
            ], 'got write event')
          })

          switch (method) {
            case 'batch':
              await db.batch([{ type: 'put', key: 456, value: 99, custom: 123, sublevel }])
              break
            case 'chained batch':
              await db.batch().put(456, 99, { custom: 123, sublevel }).write()
              break
            case 'singular':
              // Does not support sublevel option
              await db.put(456, 99, { custom: 123, sublevel })
              break
          }

          return db.close()
        })

        test(`db emits write event for ${method} del operation (deferred: ${deferred}, sublevel: ${withSublevel})`, async function (t) {
          t.plan(1)

          const db = testCommon.factory()
          const sublevel = withSublevel ? db.sublevel('abc') : null

          if (!deferred) {
            await db.open()
            if (withSublevel) await sublevel.open()
          }

          // See notes above, in the put test
          const dbEncoding = db.keyEncoding('utf8')
          const subEncoding = withSublevel ? sublevel.keyEncoding('utf8') : null

          db.on('write', function (ops) {
            t.same(ops, [
              {
                type: 'del',
                key: withSublevel ? sublevel.prefixKey(subEncoding.encode('456'), subEncoding.format, true) : 456,
                keyEncoding: db.keyEncoding(withSublevel ? subEncoding.format : 'utf8'),
                encodedKey: withSublevel ? sublevel.prefixKey(subEncoding.encode('456'), subEncoding.format, true) : dbEncoding.encode('456'),
                custom: 123,
                sublevel: null // Should be unset
              }
            ], 'got write event')
          })

          switch (method) {
            case 'batch':
              await db.batch([{ type: 'del', key: 456, custom: 123, sublevel }])
              break
            case 'chained batch':
              await db.batch().del(456, { custom: 123, sublevel }).write()
              break
            case 'singular':
              // Does not support sublevel option
              await db.del(456, { custom: 123, sublevel })
              break
          }

          return db.close()
        })
      }
    }

    for (const method of batchMethods) {
      test(`db emits write event for multiple ${method} operations (deferred: ${deferred})`, async function (t) {
        t.plan(1)

        const db = testCommon.factory()
        if (!deferred) await db.open()

        db.on('write', function (ops) {
          t.same(ops.map(op => op.key), ['a', 'b'], 'got multiple operations in one event')
        })

        switch (method) {
          case 'batch':
            await db.batch([{ type: 'put', key: 'a', value: 'foo' }, { type: 'del', key: 'b' }])
            break
          case 'chained batch':
            await db.batch().put('a', 'foo').del('b').write()
            break
        }

        return db.close()
      })
    }
  }
}
