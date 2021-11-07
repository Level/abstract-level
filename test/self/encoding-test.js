'use strict'

const test = require('tape')
const { Buffer } = require('buffer')
const { mockDown, mockChainedBatch, mockIterator, nullishEncoding } = require('../util')
const identity = (v) => v

const utf8Manifest = { encodings: { utf8: true } }
const dualManifest = { encodings: { utf8: true, buffer: true } }
const hasOwnProperty = Object.prototype.hasOwnProperty

for (const deferred of [false, true]) {
  // NOTE: adapted from encoding-down
  test(`get() encodes utf8 key (deferred: ${deferred})`, async function (t) {
    t.plan(4)

    const db = mockDown({
      _get (key, options, callback) {
        t.is(key, '8')
        t.is(options.keyEncoding, 'utf8')
        t.is(options.valueEncoding, 'utf8')
        this.nextTick(callback, null, 'foo')
      }
    }, utf8Manifest)

    if (!deferred) await db.open()
    t.same(await db.get(8), 'foo')
  })

  // NOTE: adapted from encoding-down
  test(`get() takes encoding options (deferred: ${deferred})`, async function (t) {
    t.plan(4)

    const db = mockDown({
      _get (key, options, callback) {
        t.is(key, '[1,"2"]')
        t.is(options.keyEncoding, 'utf8')
        t.is(options.valueEncoding, 'utf8')
        this.nextTick(callback, null, '123')
      }
    }, utf8Manifest)

    if (!deferred) await db.open()
    t.same(await db.get([1, '2'], { keyEncoding: 'json', valueEncoding: 'json' }), 123)
  })

  // NOTE: adapted from encoding-down
  test(`get() with custom value encoding that wants a buffer (deferred: ${deferred})`, async function (t) {
    t.plan(3)

    const db = mockDown({
      _get (key, options, callback) {
        t.same(key, 'key')
        t.same(options, { keyEncoding: 'utf8', valueEncoding: 'buffer' })
        this.nextTick(callback, null, Buffer.alloc(1))
      }
    }, dualManifest, {
      keyEncoding: 'utf8',
      valueEncoding: { encode: identity, decode: identity, format: 'buffer' }
    })

    if (!deferred) await db.open()
    t.same(await db.get('key'), Buffer.alloc(1))
  })

  // NOTE: adapted from encoding-down
  test(`get() with custom value encoding that wants a string (deferred: ${deferred})`, async function (t) {
    t.plan(3)

    const db = mockDown({
      _get (key, options, callback) {
        t.same(key, Buffer.from('key'))
        t.same(options, { keyEncoding: 'buffer', valueEncoding: 'utf8' })
        this.nextTick(callback, null, 'x')
      }
    }, dualManifest, {
      keyEncoding: 'buffer',
      valueEncoding: { encode: identity, decode: identity, format: 'utf8' }
    })

    if (!deferred) await db.open()
    t.same(await db.get(Buffer.from('key')), 'x')
  })

  // NOTE: adapted from encoding-down
  test(`put() encodes utf8 key and value (deferred: ${deferred})`, async function (t) {
    t.plan(4)

    const db = mockDown({
      _put (key, value, options, callback) {
        t.is(key, '8')
        t.is(value, '4')
        t.is(options.keyEncoding, 'utf8')
        t.is(options.valueEncoding, 'utf8')
        this.nextTick(callback)
      }
    }, utf8Manifest)

    if (!deferred) await db.open()
    await db.put(8, 4)
  })

  // NOTE: adapted from encoding-down
  test(`put() takes encoding options (deferred: ${deferred})`, async function (t) {
    t.plan(4)

    const db = mockDown({
      _put (key, value, options, callback) {
        t.is(key, '[1,"2"]')
        t.is(value, '{"x":3}')
        t.is(options.keyEncoding, 'utf8')
        t.is(options.valueEncoding, 'utf8')
        this.nextTick(callback)
      }
    }, utf8Manifest)

    if (!deferred) await db.open()
    await db.put([1, '2'], { x: 3 }, { keyEncoding: 'json', valueEncoding: 'json' })
  })

  // NOTE: adapted from encoding-down
  test(`del() encodes utf8 key (deferred: ${deferred})`, async function (t) {
    t.plan(2)

    const db = mockDown({
      _del (key, options, callback) {
        t.is(key, '2')
        t.is(options.keyEncoding, 'utf8')
        this.nextTick(callback)
      }
    }, utf8Manifest)

    if (!deferred) await db.open()
    await db.del(2)
  })

  // NOTE: adapted from encoding-down
  test(`del() takes keyEncoding option (deferred: ${deferred})`, async function (t) {
    t.plan(2)

    const db = mockDown({
      _del (key, options, callback) {
        t.is(key, '[1,"2"]')
        t.is(options.keyEncoding, 'utf8')
        this.nextTick(callback)
      }
    }, utf8Manifest)

    if (!deferred) await db.open()
    await db.del([1, '2'], { keyEncoding: 'json' })
  })

  test(`getMany() encodes utf8 key (deferred: ${deferred})`, async function (t) {
    t.plan(4)

    const db = mockDown({
      _getMany (keys, options, callback) {
        t.same(keys, ['8', '29'])
        t.is(options.keyEncoding, 'utf8')
        t.is(options.valueEncoding, 'utf8')
        this.nextTick(callback, null, ['foo', 'bar'])
      }
    }, utf8Manifest)

    if (!deferred) await db.open()
    t.same(await db.getMany([8, 29]), ['foo', 'bar'])
  })

  test(`getMany() takes encoding options (deferred: ${deferred})`, async function (t) {
    t.plan(4)

    const db = mockDown({
      _getMany (keys, options, callback) {
        t.same(keys, ['[1,"2"]', '"x"'])
        t.is(options.keyEncoding, 'utf8')
        t.is(options.valueEncoding, 'utf8')
        this.nextTick(callback, null, ['123', '"hi"'])
      }
    }, utf8Manifest)

    if (!deferred) await db.open()
    t.same(await db.getMany([[1, '2'], 'x'], { keyEncoding: 'json', valueEncoding: 'json' }), [123, 'hi'])
  })

  test(`getMany() with custom value encoding that wants a buffer (deferred: ${deferred})`, async function (t) {
    t.plan(3)

    const db = mockDown({
      _getMany (keys, options, callback) {
        t.same(keys, ['key'])
        t.same(options, { keyEncoding: 'utf8', valueEncoding: 'buffer' })
        this.nextTick(callback, null, [Buffer.alloc(1)])
      }
    }, dualManifest, {
      keyEncoding: 'utf8',
      valueEncoding: { encode: identity, decode: identity, format: 'buffer' }
    })

    if (!deferred) await db.open()
    t.same(await db.getMany(['key']), [Buffer.alloc(1)])
  })

  test(`getMany() with custom value encoding that wants a string (deferred: ${deferred})`, async function (t) {
    t.plan(3)

    const db = mockDown({
      _getMany (keys, options, callback) {
        t.same(keys, [Buffer.from('key')])
        t.same(options, { keyEncoding: 'buffer', valueEncoding: 'utf8' })
        this.nextTick(callback, null, ['x'])
      }
    }, dualManifest, {
      keyEncoding: 'buffer',
      valueEncoding: { encode: identity, decode: identity, format: 'utf8' }
    })

    if (!deferred) await db.open()
    t.same(await db.getMany([Buffer.from('key')]), ['x'])
  })

  // NOTE: adapted from encoding-down
  test(`chainedBatch.put() and del() encode utf8 key and value (deferred: ${deferred})`, async function (t) {
    t.plan(deferred ? 2 : 4)

    let db

    if (deferred) {
      db = mockDown({
        _batch (array, options, callback) {
          t.same(array, [
            { type: 'put', key: '1', value: '2', keyEncoding: 'utf8', valueEncoding: 'utf8' },
            { type: 'del', key: '3', keyEncoding: 'utf8' }
          ])
          t.same(options, {})
          this.nextTick(callback)
        }
      }, utf8Manifest)
    } else {
      db = mockDown({
        _chainedBatch () {
          return mockChainedBatch(this, {
            _put: function (key, value, options) {
              t.same({ key, value }, { key: '1', value: '2' })
              t.same(options, { keyEncoding: 'utf8', valueEncoding: 'utf8' })
            },
            _del: function (key, options) {
              t.is(key, '3')
              t.same(options, { keyEncoding: 'utf8' })
            }
          })
        }
      }, utf8Manifest)
    }

    if (!deferred) await db.open()
    await db.batch().put(1, 2).del(3).write()
  })

  // NOTE: adapted from encoding-down
  test(`chainedBatch.put() and del() take encoding options (deferred: ${deferred})`, async function (t) {
    t.plan(deferred ? 2 : 4)

    let db

    const putOptions = { keyEncoding: 'json', valueEncoding: 'json' }
    const delOptions = { keyEncoding: 'json' }

    if (deferred) {
      db = mockDown({
        _batch (array, options, callback) {
          t.same(array, [
            { type: 'put', key: '"1"', value: '{"x":[2]}', keyEncoding: 'utf8', valueEncoding: 'utf8' },
            { type: 'del', key: '"3"', keyEncoding: 'utf8' }
          ])
          t.same(options, {})
          this.nextTick(callback)
        }
      }, utf8Manifest)
    } else {
      db = mockDown({
        _chainedBatch () {
          return mockChainedBatch(this, {
            _put: function (key, value, options) {
              t.same({ key, value }, { key: '"1"', value: '{"x":[2]}' })
              t.same(options, { keyEncoding: 'utf8', valueEncoding: 'utf8' })
            },
            _del: function (key, options) {
              t.is(key, '"3"')
              t.same(options, { keyEncoding: 'utf8' })
            }
          })
        }
      }, utf8Manifest)
    }

    if (!deferred) await db.open()
    await db.batch().put('1', { x: [2] }, putOptions).del('3', delOptions).write()
  })

  // NOTE: adapted from encoding-down
  test(`_iterator() receives default encoding options (deferred: ${deferred})`, async function (t) {
    t.plan(2)

    const db = mockDown({
      _iterator (options) {
        t.is(options.keyEncoding, 'utf8')
        t.is(options.valueEncoding, 'utf8')
        return mockIterator(this, options, {})
      }
    }, utf8Manifest)

    if (!deferred) await db.open()
    await db.iterator().next()
  })

  // NOTE: adapted from encoding-down
  test(`iterator() takes encoding options (deferred: ${deferred})`, async function (t) {
    t.plan(3)

    const db = mockDown({
      _iterator (options) {
        t.is(options.keyEncoding, 'utf8')
        t.is(options.valueEncoding, 'buffer')

        return mockIterator(this, options, {
          _next (callback) {
            this.nextTick(callback, null, '281', Buffer.from('a'))
          }
        })
      }
    }, dualManifest)

    if (!deferred) await db.open()
    const kv = await db.iterator({ keyEncoding: 'json', valueEncoding: 'hex' }).next()
    t.same(kv, [281, '61'])
  })

  // NOTE: adapted from encoding-down
  test(`iterator() with custom encodings that want a buffer (deferred: ${deferred})`, async function (t) {
    t.plan(3)

    const db = mockDown({
      _iterator (options) {
        t.is(options.keyEncoding, 'buffer')
        t.is(options.valueEncoding, 'buffer')

        return mockIterator(this, options, {
          _next (callback) {
            this.nextTick(callback, null, Buffer.from('a'), Buffer.from('b'))
          }
        })
      }
    }, dualManifest)

    const encoding = { encode: identity, decode: identity, format: 'buffer' }
    if (!deferred) await db.open()
    const kv = await db.iterator({ keyEncoding: encoding, valueEncoding: encoding }).next()
    t.same(kv, [Buffer.from('a'), Buffer.from('b')])
  })

  // NOTE: adapted from encoding-down
  test(`iterator() with custom encodings that want a string (deferred: ${deferred})`, async function (t) {
    t.plan(3)

    const db = mockDown({
      _iterator (options) {
        t.is(options.keyEncoding, 'utf8')
        t.is(options.valueEncoding, 'utf8')

        return mockIterator(this, options, {
          _next (callback) {
            this.nextTick(callback, null, 'a', 'b')
          }
        })
      }
    }, dualManifest)

    const encoding = { encode: identity, decode: identity, format: 'utf8' }
    if (!deferred) await db.open()
    const kv = await db.iterator({ keyEncoding: encoding, valueEncoding: encoding }).next()
    t.same(kv, ['a', 'b'])
  })

  // NOTE: adapted from encoding-down
  test(`iterator() skips decoding keys if options.keys is false (deferred: ${deferred})`, async function (t) {
    t.plan(3)

    const keyEncoding = {
      format: 'utf8',
      decode (key) {
        t.fail('should not be called')
      },
      encode: identity
    }

    const db = mockDown({
      _iterator (options) {
        t.is(options.keys, false)

        return mockIterator(this, options, {
          _next (callback) {
            this.nextTick(callback, null, '', 'value')
          }
        })
      }
    }, utf8Manifest, { keyEncoding })

    if (!deferred) await db.open()
    const [key, value] = await db.iterator({ keys: false }).next()

    t.is(key, undefined, 'normalized key to undefined')
    t.is(value, 'value', 'got value')
  })

  // NOTE: adapted from encoding-down
  test(`iterator() skips decoding values if options.values is false (deferred: ${deferred})`, async function (t) {
    t.plan(3)

    const valueEncoding = {
      format: 'utf8',
      decode (value) {
        t.fail('should not be called')
      },
      encode: identity
    }

    const db = mockDown({
      _iterator (options) {
        t.is(options.values, false)

        return mockIterator(this, options, {
          _next (callback) {
            callback(null, 'key', '')
          }
        })
      }
    }, utf8Manifest, { valueEncoding })

    if (!deferred) await db.open()
    const [key, value] = await db.iterator({ values: false }).next()

    t.is(key, 'key', 'got key')
    t.is(value, undefined, 'normalized value to undefined')
  })

  // NOTE: adapted from encoding-down
  test(`iterator() encodes range options (deferred: ${deferred})`, async function (t) {
    t.plan(5)

    const keyEncoding = {
      format: 'utf8',
      encode (key) {
        return 'encoded_' + key
      },
      decode: identity
    }

    const db = mockDown({
      _iterator (options) {
        t.is(options.gt, 'encoded_3')
        t.is(options.gte, 'encoded_4')
        t.is(options.lt, 'encoded_5')
        t.is(options.lte, 'encoded_6')
        t.is(options.foo, 7)
        return mockIterator(this, options)
      }
    }, utf8Manifest, { keyEncoding })

    if (!deferred) await db.open()
    await db.iterator({ gt: 3, gte: 4, lt: 5, lte: 6, foo: 7 }).next()
  })

  // NOTE: adapted from encoding-down
  test(`iterator() does not strip nullish range options (deferred: ${deferred})`, async function (t) {
    t.plan(12)

    const db1 = mockDown({
      _iterator (options) {
        t.is(options.gt, '\x00', 'encoded null')
        t.is(options.gte, '\x00', 'encoded null')
        t.is(options.lt, '\x00', 'encoded null')
        t.is(options.lte, '\x00', 'encoded null')

        return mockIterator(this, options)
      }
    }, utf8Manifest, { keyEncoding: nullishEncoding, valueEncoding: nullishEncoding })

    const db2 = mockDown({
      _iterator (options) {
        t.is(hasOwnProperty.call(options, 'gt'), true)
        t.is(hasOwnProperty.call(options, 'gte'), true)
        t.is(hasOwnProperty.call(options, 'lt'), true)
        t.is(hasOwnProperty.call(options, 'lte'), true)

        t.is(options.gt, '\xff', 'encoded undefined')
        t.is(options.gte, '\xff', 'encoded undefined')
        t.is(options.lt, '\xff', 'encoded undefined')
        t.is(options.lte, '\xff', 'encoded undefined')

        return mockIterator(this, options)
      }
    }, utf8Manifest, { keyEncoding: nullishEncoding, valueEncoding: nullishEncoding })

    if (!deferred) {
      await Promise.all([db1.open(), db2.open()])
    }

    const promise1 = db1.iterator({
      gt: null,
      gte: null,
      lt: null,
      lte: null
    }).next()

    const promise2 = db2.iterator({
      gt: undefined,
      gte: undefined,
      lt: undefined,
      lte: undefined
    }).next()

    return Promise.all([promise1, promise2])
  })

  // NOTE: adapted from encoding-down
  test(`iterator() does not add nullish range options (deferred: ${deferred})`, async function (t) {
    t.plan(4)

    const db = mockDown({
      _iterator (options) {
        t.is(hasOwnProperty.call(options, 'gt'), false)
        t.is(hasOwnProperty.call(options, 'gte'), false)
        t.is(hasOwnProperty.call(options, 'lt'), false)
        t.is(hasOwnProperty.call(options, 'lte'), false)

        return mockIterator(this, options)
      }
    })

    if (!deferred) await db.open()
    await db.iterator({}).next()
  })

  // NOTE: adapted from encoding-down
  test(`iterator() encodes seek target (deferred: ${deferred})`, async function (t) {
    t.plan(2)

    const db = mockDown({
      _iterator (options) {
        return mockIterator(this, options, {
          _seek (target, options) {
            t.is(target, '"a"', 'encoded once')
            t.same(options, { keyEncoding: 'utf8' })
          }
        })
      }
    }, utf8Manifest, { keyEncoding: 'json' })

    if (!deferred) await db.open()
    const it = db.iterator()
    it.seek('a')
    await it.next()
  })

  // NOTE: adapted from encoding-down
  test(`iterator() encodes seek target with custom encoding (deferred: ${deferred})`, async function (t) {
    t.plan(1)

    const targets = []
    const db = mockDown({
      _iterator (options) {
        return mockIterator(this, options, {
          _seek (target) {
            targets.push(target)
          }
        })
      }
    }, utf8Manifest)

    if (!deferred) await db.open()

    db.iterator().seek('a')
    db.iterator({ keyEncoding: 'json' }).seek('a')
    db.iterator().seek('b', { keyEncoding: 'json' })

    await db.open()
    t.same(targets, ['a', '"a"', '"b"'], 'encoded targets')
  })

  // NOTE: adapted from encoding-down
  test(`iterator() encodes nullish seek target (deferred: ${deferred})`, async function (t) {
    t.plan(1)

    const targets = []
    const db = mockDown({
      _iterator (options) {
        return mockIterator(this, options, {
          _seek (target) {
            targets.push(target)
          }
        })
      }
    }, utf8Manifest, { keyEncoding: { encode: String, decode: identity, format: 'utf8' } })

    if (!deferred) await db.open()

    // Unlike keys, nullish targets should not be rejected;
    // assume that the encoding gives these types meaning.
    db.iterator().seek(null)
    db.iterator().seek(undefined)

    await db.open()
    t.same(targets, ['null', 'undefined'], 'encoded')
  })

  // NOTE: adapted from encoding-down
  test(`clear() receives keyEncoding option (deferred: ${deferred})`, async function (t) {
    t.plan(1)

    const db = mockDown({
      _clear: function (options, callback) {
        t.same(options, { keyEncoding: 'utf8', reverse: false, limit: -1 })
        this.nextTick(callback)
      }
    }, utf8Manifest)

    if (!deferred) await db.open()
    await db.clear()
  })

  test(`clear() takes keyEncoding option (deferred: ${deferred})`, async function (t) {
    t.plan(1)

    const db = mockDown({
      _clear: function (options, callback) {
        t.same(options, { keyEncoding: 'utf8', gt: '"a"', reverse: false, limit: -1 })
        this.nextTick(callback)
      }
    }, utf8Manifest)

    if (!deferred) await db.open()
    await db.clear({ keyEncoding: 'json', gt: 'a' })
  })

  // NOTE: adapted from encoding-down
  test(`clear() encodes range options (deferred: ${deferred})`, async function (t) {
    t.plan(5)

    const keyEncoding = {
      format: 'utf8',
      encode: function (key) {
        return 'encoded_' + key
      },
      decode: identity
    }

    const db = mockDown({
      _clear: function (options, callback) {
        t.is(options.gt, 'encoded_1')
        t.is(options.gte, 'encoded_2')
        t.is(options.lt, 'encoded_3')
        t.is(options.lte, 'encoded_4')
        t.is(options.foo, 5)
        this.nextTick(callback)
      }
    }, utf8Manifest, { keyEncoding })

    if (!deferred) await db.open()
    await db.clear({ gt: 1, gte: 2, lt: 3, lte: 4, foo: 5 })
  })

  // NOTE: adapted from encoding-down
  test(`clear() does not strip nullish range options (deferred: ${deferred})`, async function (t) {
    t.plan(12)

    const db1 = mockDown({
      _clear: function (options, callback) {
        t.is(options.gt, '\x00', 'encoded null')
        t.is(options.gte, '\x00', 'encoded null')
        t.is(options.lt, '\x00', 'encoded null')
        t.is(options.lte, '\x00', 'encoded null')
        this.nextTick(callback)
      }
    }, utf8Manifest, { keyEncoding: nullishEncoding, valueEncoding: nullishEncoding })

    const db2 = mockDown({
      _clear: function (options, callback) {
        t.is(hasOwnProperty.call(options, 'gt'), true)
        t.is(hasOwnProperty.call(options, 'gte'), true)
        t.is(hasOwnProperty.call(options, 'lt'), true)
        t.is(hasOwnProperty.call(options, 'lte'), true)

        t.is(options.gt, '\xff', 'encoded undefined')
        t.is(options.gte, '\xff', 'encoded undefined')
        t.is(options.lt, '\xff', 'encoded undefined')
        t.is(options.lte, '\xff', 'encoded undefined')

        this.nextTick(callback)
      }
    }, utf8Manifest, { keyEncoding: nullishEncoding, valueEncoding: nullishEncoding })

    if (!deferred) {
      await Promise.all([db1.open(), db2.open()])
    }

    const promise1 = db1.clear({
      gt: null,
      gte: null,
      lt: null,
      lte: null
    })

    const promise2 = db2.clear({
      gt: undefined,
      gte: undefined,
      lt: undefined,
      lte: undefined
    })

    await Promise.all([promise1, promise2])
  })

  // NOTE: adapted from encoding-down
  test(`clear() does not add nullish range options (deferred: ${deferred})`, async function (t) {
    t.plan(4)

    const db = mockDown({
      _clear: function (options, callback) {
        t.is(hasOwnProperty.call(options, 'gt'), false)
        t.is(hasOwnProperty.call(options, 'gte'), false)
        t.is(hasOwnProperty.call(options, 'lt'), false)
        t.is(hasOwnProperty.call(options, 'lte'), false)
        this.nextTick(callback)
      }
    })

    if (!deferred) await db.open()
    await db.clear({})
  })
}
