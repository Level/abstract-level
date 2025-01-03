'use strict'

const test = require('tape')
const { Buffer } = require('buffer')
const { AbstractLevel, AbstractSublevel } = require('../..')
const { AbstractIterator, AbstractKeyIterator, AbstractValueIterator } = require('../..')

class NoopLevel extends AbstractLevel {
  constructor (...args) {
    super(
      { encodings: { utf8: true, buffer: true, view: true } },
      ...args
    )
  }
}

test('sublevel is extensible', function (t) {
  t.plan(6)

  class MockLevel extends AbstractLevel {
    _sublevel (name, options) {
      t.is(name, 'test')
      t.same(options, { separator: '!', customOption: 123 })

      return new MockSublevel(this, name, {
        ...options,
        manifest: {
          encodings: { ignored: true },
          additionalMethods: { test: true },
          events: { foo: true }
        }
      })
    }
  }

  class MockSublevel extends AbstractSublevel {
    test () {
      this.emit('foo')
    }
  }

  const db = new MockLevel({
    encodings: { utf8: true },
    additionalMethods: { ignored: true },
    events: { ignored: true }
  })

  const sub = db.sublevel('test', { customOption: 123 })

  t.is(sub.supports.encodings.ignored, undefined)
  t.same(sub.supports.additionalMethods, { test: true })
  t.same(sub.supports.events, {
    foo: true,

    // Added by AbstractLevel
    opening: true,
    open: true,
    closing: true,
    closed: true,
    write: true,
    clear: true
  })

  sub.on('foo', () => t.pass('emitted'))
  sub.test()
})

// NOTE: adapted from subleveldown
test('sublevel name and options', function (t) {
  t.test('empty name', function (t) {
    const sub = new NoopLevel().sublevel('')
    t.is(sub.prefix, '!!')
    t.same(sub.path(), [''])
    t.end()
  })

  t.test('name without options', function (t) {
    const sub = new NoopLevel().sublevel('name')
    t.is(sub.prefix, '!name!')
    t.same(sub.path(), ['name'])
    t.end()
  })

  t.test('name and separator option', function (t) {
    const sub = new NoopLevel().sublevel('name', { separator: '%' })
    t.is(sub.prefix, '%name%')
    t.same(sub.path(), ['name'])
    t.end()
  })

  t.test('array name', function (t) {
    const sub = new NoopLevel().sublevel(['a', 'b'])
    const alt = new NoopLevel().sublevel('a').sublevel('b')

    t.is(sub.prefix, '!a!!b!')
    t.same(sub.path(), ['a', 'b'])
    t.same(sub.path(true), ['a', 'b'])

    t.is(alt.prefix, sub.prefix)
    t.same(alt.path(), ['a', 'b'])
    t.same(alt.path(true), ['b'])

    t.end()
  })

  t.test('empty array name', function (t) {
    const sub = new NoopLevel().sublevel(['', ''])
    t.is(sub.prefix, '!!!!')
    const alt = new NoopLevel().sublevel('').sublevel('')
    t.is(alt.prefix, sub.prefix)
    t.end()
  })

  t.test('array name with single element', function (t) {
    const sub = new NoopLevel().sublevel(['a'])
    t.is(sub.prefix, '!a!')
    t.same(sub.path(), ['a'])

    const alt = new NoopLevel().sublevel('a')
    t.is(alt.prefix, sub.prefix)
    t.same(sub.path(), alt.path())

    t.end()
  })

  t.test('array name and separator option', function (t) {
    const sub = new NoopLevel().sublevel(['a', 'b'], { separator: '%' })
    t.is(sub.prefix, '%a%%b%')
    t.same(sub.path(), ['a', 'b'])

    const alt = new NoopLevel().sublevel('a', { separator: '%' }).sublevel('b', { separator: '%' })
    t.is(alt.prefix, sub.prefix)
    t.same(alt.path(), ['a', 'b'])

    t.end()
  })

  t.test('separator is trimmed from name', function (t) {
    const sub1 = new NoopLevel().sublevel('!name')
    t.is(sub1.prefix, '!name!')
    t.same(sub1.path(), ['name'])

    const sub2 = new NoopLevel().sublevel('name!')
    t.is(sub2.prefix, '!name!')
    t.same(sub2.path(), ['name'])

    const sub3 = new NoopLevel().sublevel('!!name!!')
    t.is(sub3.prefix, '!name!')
    t.same(sub3.path(), ['name'])

    const sub4 = new NoopLevel().sublevel('@name@', { separator: '@' })
    t.is(sub4.prefix, '@name@')
    t.same(sub4.path(), ['name'])

    const sub5 = new NoopLevel().sublevel(['!!!a', 'b!!!'])
    t.is(sub5.prefix, '!a!!b!')
    t.same(sub5.path(), ['a', 'b'])

    const sub6 = new NoopLevel().sublevel(['a@@@', '@@@b'], { separator: '@' })
    t.is(sub6.prefix, '@a@@b@')
    t.same(sub6.path(), ['a', 'b'])

    t.end()
  })

  t.test('repeated separator can not result in empty prefix', function (t) {
    const sub1 = new NoopLevel().sublevel('!!!!')
    t.is(sub1.prefix, '!!')
    t.same(sub1.path(), [''])

    const sub2 = new NoopLevel().sublevel(['!!!!', '!!!!'])
    t.is(sub2.prefix, '!!!!')
    t.same(sub2.path(), ['', ''])

    t.end()
  })

  t.test('invalid sublevel prefix', function (t) {
    t.throws(() => new NoopLevel().sublevel('foo\x05'), (err) => err.code === 'LEVEL_INVALID_PREFIX')
    t.throws(() => new NoopLevel().sublevel('foo\xff'), (err) => err.code === 'LEVEL_INVALID_PREFIX')
    t.throws(() => new NoopLevel().sublevel(['ok', 'foo\xff']), (err) => err.code === 'LEVEL_INVALID_PREFIX')
    t.throws(() => new NoopLevel().sublevel('foo!', { separator: '@' }), (err) => err.code === 'LEVEL_INVALID_PREFIX')
    t.throws(() => new NoopLevel().sublevel(['ok', 'foo!'], { separator: '@' }), (err) => err.code === 'LEVEL_INVALID_PREFIX')
    t.end()
  })

  // See https://github.com/Level/subleveldown/issues/78
  t.test('doubly nested sublevel has correct prefix', async function (t) {
    t.plan(1)

    const keys = []
    class MockLevel extends AbstractLevel {
      async _put (key, value, options) {
        keys.push(key)
      }
    }

    const db = new MockLevel({ encodings: { utf8: true } })
    const sub1 = db.sublevel('1')
    const sub2 = sub1.sublevel('2')
    const sub3 = sub2.sublevel('3')

    await sub1.put('a', 'value')
    await sub2.put('b', 'value')
    await sub3.put('c', 'value')

    t.same(keys.sort(), [
      '!1!!2!!3!c',
      '!1!!2!b',
      '!1!a'
    ])
  })

  t.end()
})

test('sublevel.prefixKey()', function (t) {
  const db = new AbstractLevel({ encodings: { utf8: true, buffer: true, view: true } })
  const sub = db.sublevel('test')
  const textEncoder = new TextEncoder()

  t.same(sub.prefixKey('', 'utf8'), '!test!')
  t.same(sub.prefixKey('a', 'utf8'), '!test!a')
  t.same(sub.prefixKey('', 'utf8', false), '!test!', 'explicitly global')
  t.same(sub.prefixKey('a', 'utf8', false), '!test!a', 'explicitly global')
  t.same(sub.prefixKey('', 'utf8', true), '!test!', 'local')
  t.same(sub.prefixKey('a', 'utf8', true), '!test!a', 'local')

  t.same(sub.prefixKey(Buffer.from(''), 'buffer'), Buffer.from('!test!'))
  t.same(sub.prefixKey(Buffer.from('a'), 'buffer'), Buffer.from('!test!a'))

  t.same(sub.prefixKey(textEncoder.encode(''), 'view'), textEncoder.encode('!test!'))
  t.same(sub.prefixKey(textEncoder.encode('a'), 'view'), textEncoder.encode('!test!a'))

  const nested = sub.sublevel('nested')
  t.same(nested.prefixKey('', 'utf8'), '!test!!nested!')
  t.same(nested.prefixKey('a', 'utf8'), '!test!!nested!a')
  t.same(nested.prefixKey('', 'utf8', false), '!test!!nested!', 'explicitly global')
  t.same(nested.prefixKey('a', 'utf8', false), '!test!!nested!a', 'explicitly global')
  t.same(nested.prefixKey('', 'utf8', true), '!nested!', 'local')
  t.same(nested.prefixKey('a', 'utf8', true), '!nested!a', 'local')

  t.end()
})

// NOTE: adapted from subleveldown
test('sublevel manifest and parent db', function (t) {
  t.test('sublevel inherits manifest from parent db', function (t) {
    const parent = new AbstractLevel({
      encodings: { utf8: true },
      explicitSnapshots: true,
      foo: true
    })
    const sub = parent.sublevel('')
    t.is(sub.supports.foo, true, 'AbstractSublevel inherits from parent')
    t.is(sub.supports.explicitSnapshots, true, 'AbstractSublevel inherits from parent')
    t.end()
  })

  t.test('sublevel does not support additionalMethods', function (t) {
    const parent = new AbstractLevel({
      encodings: { utf8: true },
      additionalMethods: { foo: true }
    })

    // We're expecting that AbstractSublevel removes the additionalMethod
    // because it can't automatically prefix any key(-like) arguments
    const sub = parent.sublevel('')
    t.same(sub.supports.additionalMethods, {})
    t.same(parent.supports.additionalMethods, { foo: true })
    t.is(typeof sub.foo, 'undefined', 'AbstractSublevel does not expose method')
    t.end()
  })

  t.test('sublevel.db is set to root db', function (t) {
    const db = new NoopLevel()
    const sub = db.sublevel('test')
    const nested = sub.sublevel('nested')
    t.ok(sub.db === db)
    t.ok(nested.db === db)
    t.end()
  })

  t.test('sublevel.parent is set to parent db', function (t) {
    const db = new NoopLevel()
    const sub = db.sublevel('test')
    const nested = sub.sublevel('nested')
    t.ok(sub.parent === db)
    t.ok(nested.parent === sub)
    t.end()
  })

  t.test('root db has a null parent', function (t) {
    const db = new NoopLevel()
    t.is(db.parent, null)
    t.end()
  })

  t.end()
})

// NOTE: adapted from subleveldown
test('opening & closing sublevel', function (t) {
  t.test('error from open() does not bubble up to sublevel', function (t) {
    t.plan(5)

    class MockLevel extends AbstractLevel {
      async _open (opts) {
        throw new Error('test')
      }
    }

    const db = new MockLevel({ encodings: { buffer: true } })
    const sub = db.sublevel('test')

    db.open().catch((err) => {
      t.is(err.code, 'LEVEL_DATABASE_NOT_OPEN')
      t.is(err.cause && err.cause.message, 'test')
    })

    sub.open().catch((err) => {
      t.is(err.code, 'LEVEL_DATABASE_NOT_OPEN')
      t.is(err.cause && err.cause.code, 'LEVEL_DATABASE_NOT_OPEN') // from db
      t.is(err.cause && err.cause.cause, undefined) // but does not have underlying error
    })
  })

  t.test('cannot create a sublevel on a closed db', async function (t) {
    t.plan(2)

    const db = new NoopLevel()
    await db.open()
    await db.close()

    const sub = db.sublevel('test')

    try {
      await sub.open()
    } catch (err) {
      t.is(err.code, 'LEVEL_DATABASE_NOT_OPEN', 'sublevel not opened')
      t.is(err.message, 'Database failed to open')
    }

    await db.open()
    await sub.open()
    await db.sublevel('test2').open()
  })

  t.test('can close db and sublevel once opened', async function (t) {
    const db = new NoopLevel()
    await db.open()
    const sub = db.sublevel('test')
    await sub.open()
    await db.close()
    await sub.close()
  })

  t.test('sublevel is closed by parent', async function (t) {
    t.plan(4)

    const db = new NoopLevel()
    await db.open()
    const sub = db.sublevel('test')

    await db.open()
    await sub.open()

    const promise = db.close()

    t.is(db.status, 'closing')
    t.is(sub.status, 'closing')

    await promise

    t.is(db.status, 'closed')
    t.is(sub.status, 'closed')
  })

  t.test('sublevel rejects operations if parent db is closed', async function (t) {
    t.plan(6)

    const db = new NoopLevel()
    await db.open()

    const sub = db.sublevel('test')
    const it = sub.iterator()

    await sub.open()
    await db.close()

    const promises = [
      sub.put('foo', 'bar').catch(verify),
      sub.get('foo').catch(verify),
      sub.del('foo').catch(verify),
      sub.clear().catch(verify),
      sub.batch([{ type: 'del', key: 'foo' }]).catch(verify),
      it.next().catch(function (err) {
        t.is(err.code, 'LEVEL_ITERATOR_NOT_OPEN')
        return it.close()
      })
    ]

    await Promise.all(promises)

    function verify (err) {
      t.is(err.code, 'LEVEL_DATABASE_NOT_OPEN')
    }
  })

  t.test('close db while sublevel is opening', async function (t) {
    t.plan(7)

    const db = new NoopLevel()
    await db.open()
    const sub = db.sublevel('test')

    t.is(db.status, 'open')
    t.is(sub.status, 'opening')

    const promises = [
      db.close().then(async function () {
        // Ideally it'd be 'closed' but it's still 'opening' at this point.
        // TODO: use a signal to abort the open() to transition to 'closed' faster
        // t.is(sub.status, 'closed')

        t.is(db.status, 'closed')

        return sub.get('foo').then(t.fail.bind(t, 'should not succeed'), (err) => {
          t.is(err.code, 'LEVEL_DATABASE_NOT_OPEN')
          t.is(sub.status, 'closed')
        })
      }),
      sub.get('foo').then(t.fail.bind(t, 'should not succeed'), (err) => {
        t.is(err.code, 'LEVEL_DATABASE_NOT_OPEN')
        t.is(sub.status, 'closed')
      })
    ]

    await Promise.all(promises)
  })

  t.test('cannot create sublevel while db is closing', async function (t) {
    t.plan(2)

    const db = new NoopLevel()
    await db.open()
    const promise = db.close()
    const sub = db.sublevel('test')

    try {
      await sub.open()
    } catch (err) {
      t.is(err.code, 'LEVEL_DATABASE_NOT_OPEN')
      t.is(sub.status, 'closed')
    }

    return promise
  })

  t.test('can wrap a sublevel and reopen the wrapped sublevel', async function (t) {
    const db = new NoopLevel()
    const sub1 = db.sublevel('test1')
    const sub2 = sub1.sublevel('test2')

    await sub2.open()
    verify()

    // Prefixes should be the same after closing & reopening
    // See https://github.com/Level/subleveldown/issues/78
    await sub2.close()
    await sub2.open()
    verify()

    function verify () {
      t.is(sub1.prefix, '!test1!', 'sub1 prefix ok')
      t.is(sub2.prefix, '!test1!!test2!', 'sub2 prefix ok')
      t.ok(sub1.db === db, 'root is ok')
      t.ok(sub2.db === db, 'root is ok')
      t.ok(sub1.parent === db, 'parent is ok')
      t.ok(sub2.parent === sub1, 'parent is ok')
    }
  })

  // Also test default fallback implementations of keys() and values()
  for (const [mode, def] of [['iterator', false], ['keys', false], ['values', false], ['keys', true], ['values', true]]) {
    const Ctor = mode === 'iterator' || def ? AbstractIterator : mode === 'keys' ? AbstractKeyIterator : AbstractValueIterator
    const privateMethod = def ? '_iterator' : '_' + mode
    const publicMethod = mode

    t.test(`error from sublevel.${mode}() bubbles up (default implementation: ${def})`, async function (t) {
      t.plan(1)

      class MockLevel extends AbstractLevel {
        [privateMethod] (options) {
          return new MockIterator(this, options)
        }
      }

      class MockIterator extends Ctor {
        async _next () {
          throw new Error('next() error from parent database')
        }
      }

      const db = new MockLevel({ encodings: { buffer: true } })
      const sub = db.sublevel('test')
      const it = sub[publicMethod]()

      try {
        await it.next()
      } catch (err) {
        t.is(err.message, 'next() error from parent database')
      } finally {
        await it.close()
      }
    })
  }

  t.end()
})

test('sublevel operations are prefixed', function (t) {
  t.test('sublevel.getMany() is prefixed', async function (t) {
    t.plan(2)

    class MockLevel extends AbstractLevel {
      async _getMany (keys, options) {
        t.same(keys, ['!test!a', '!test!b'])
        t.same(options, { keyEncoding: 'utf8', valueEncoding: 'utf8' })
        return ['1', '2']
      }
    }

    const db = new MockLevel({ encodings: { utf8: true } })
    const sub = db.sublevel('test')

    await sub.open()
    await sub.getMany(['a', 'b'])
  })

  // Also test default fallback implementations of keys() and values()
  for (const [mode, def] of [['iterator', false], ['keys', false], ['values', false], ['keys', true], ['values', true]]) {
    const Ctor = mode === 'iterator' || def ? AbstractIterator : mode === 'keys' ? AbstractKeyIterator : AbstractValueIterator
    const privateMethod = def ? '_iterator' : '_' + mode
    const publicMethod = mode

    for (const deferred of [false, true]) {
      t.test(`sublevel ${mode}.seek() target is prefixed (default implementation: ${def}, deferred: ${deferred})`, async function (t) {
        t.plan(2)

        class MockIterator extends Ctor {
          _seek (target, options) {
            t.is(target, '!sub!123')
            t.is(options.keyEncoding, 'utf8')
          }
        }

        class MockLevel extends AbstractLevel {
          [privateMethod] (options) {
            return new MockIterator(this, options)
          }
        }

        const db = new MockLevel({ encodings: { utf8: true } })
        const sub = db.sublevel('sub', { keyEncoding: 'json' })

        if (!deferred) await sub.open()

        const it = sub[publicMethod]()
        it.seek(123)

        if (deferred) await sub.open()
      })
    }
  }

  t.test('sublevel.clear() is prefixed', async function (t) {
    t.plan(4)

    const calls = []
    class MockLevel extends AbstractLevel {
      async _clear (options) {
        calls.push(options)
      }
    }

    const db = new MockLevel({ encodings: { utf8: true } })
    const sub = db.sublevel('sub')

    const test = async (options, expected) => {
      await sub.clear(options)
      t.same(calls.shift(), expected)
    }

    await sub.open()

    await test(undefined, {
      gte: '!sub!',
      lte: '!sub"',
      keyEncoding: 'utf8',
      reverse: false,
      limit: -1
    })

    await test({ gt: 'a' }, {
      gt: '!sub!a',
      lte: '!sub"',
      keyEncoding: 'utf8',
      reverse: false,
      limit: -1
    })

    await test({ gte: 'a', lt: 'x' }, {
      gte: '!sub!a',
      lt: '!sub!x',
      keyEncoding: 'utf8',
      reverse: false,
      limit: -1
    })

    await test({ lte: 'x' }, {
      gte: '!sub!',
      lte: '!sub!x',
      keyEncoding: 'utf8',
      reverse: false,
      limit: -1
    })
  })

  t.end()
})

test('sublevel encodings', function (t) {
  // NOTE: adapted from subleveldown
  t.test('different sublevels can have different encodings', async function (t) {
    t.plan(6)

    const puts = []
    const gets = []

    class MockLevel extends AbstractLevel {
      async _put (key, value, { keyEncoding, valueEncoding }) {
        puts.push({ key, value, keyEncoding, valueEncoding })
      }

      async _get (key, { keyEncoding, valueEncoding }) {
        gets.push({ key, keyEncoding, valueEncoding })
        return puts.shift().value
      }
    }

    const db = new MockLevel({ encodings: { buffer: true, utf8: true } })
    const sub1 = db.sublevel('test1', { valueEncoding: 'json' })
    const sub2 = db.sublevel('test2', { keyEncoding: 'buffer', valueEncoding: 'buffer' })

    await sub1.put('foo', { some: 'json' })

    t.same(puts, [{
      key: '!test1!foo',
      value: '{"some":"json"}',
      keyEncoding: 'utf8',
      valueEncoding: 'utf8'
    }])

    t.same(await sub1.get('foo'), { some: 'json' })
    t.same(gets.shift(), {
      key: '!test1!foo',
      keyEncoding: 'utf8',
      valueEncoding: 'utf8'
    })

    await sub2.put(Buffer.from([1, 2]), Buffer.from([3]))

    t.same(puts, [{
      key: Buffer.from('!test2!\x01\x02'),
      value: Buffer.from([3]),
      keyEncoding: 'buffer',
      valueEncoding: 'buffer'
    }])

    t.same(await sub2.get(Buffer.from([1, 2])), Buffer.from([3]))

    t.same(gets.shift(), {
      key: Buffer.from('!test2!\x01\x02'),
      keyEncoding: 'buffer',
      valueEncoding: 'buffer'
    })
  })

  t.test('sublevel indirectly supports transcoded encoding', async function (t) {
    t.plan(3)

    class MockLevel extends AbstractLevel {
      async _put (key, value, { keyEncoding, valueEncoding }) {
        t.same({ key, value, keyEncoding, valueEncoding }, {
          key: Buffer.from('!test!foo'),
          value: Buffer.from('{"some":"json"}'),
          keyEncoding: 'buffer',
          valueEncoding: 'buffer'
        })
      }

      async _get (key, { keyEncoding, valueEncoding }) {
        t.same({ key, keyEncoding, valueEncoding }, {
          key: Buffer.from('!test!foo'),
          keyEncoding: 'buffer',
          valueEncoding: 'buffer'
        })
        return Buffer.from('{"some":"json"}')
      }
    }

    const db = new MockLevel({ encodings: { buffer: true } })
    const sub = db.sublevel('test', { valueEncoding: 'json' })

    await sub.put('foo', { some: 'json' })
    t.same(await sub.get('foo'), { some: 'json' })
  })

  t.test('concatenating sublevel Buffer keys', async function (t) {
    t.plan(8)

    const key = Buffer.from('00ff', 'hex')
    const prefixedKey = Buffer.concat([Buffer.from('!test!'), key])

    class MockLevel extends AbstractLevel {
      async _put (key, value, options) {
        t.is(options.keyEncoding, 'buffer')
        t.is(options.valueEncoding, 'buffer')
        t.same(key, prefixedKey)
        t.same(value, Buffer.from('bar'))
      }

      async _get (key, options) {
        t.is(options.keyEncoding, 'buffer')
        t.is(options.valueEncoding, 'buffer')
        t.same(key, prefixedKey)
        return Buffer.from('bar')
      }
    }

    const db = new MockLevel({ encodings: { buffer: true } })
    const sub = db.sublevel('test', { keyEncoding: 'buffer' })

    await sub.put(key, 'bar')
    t.same(await sub.get(key), 'bar')
  })

  t.test('concatenating sublevel Uint8Array keys', async function (t) {
    t.plan(8)

    const key = new Uint8Array([0, 255])
    const textEncoder = new TextEncoder()
    const prefix = textEncoder.encode('!test!')
    const prefixedKey = new Uint8Array(prefix.byteLength + key.byteLength)

    prefixedKey.set(prefix, 0)
    prefixedKey.set(key, prefix.byteLength)

    class MockLevel extends AbstractLevel {
      async _put (key, value, options) {
        t.is(options.keyEncoding, 'view')
        t.is(options.valueEncoding, 'view')
        t.same(key, prefixedKey)
        t.same(value, textEncoder.encode('bar'))
      }

      async _get (key, options) {
        t.is(options.keyEncoding, 'view')
        t.is(options.valueEncoding, 'view')
        t.same(key, prefixedKey)
        return textEncoder.encode('bar')
      }
    }

    const db = new MockLevel({ encodings: { view: true } })
    const sub = db.sublevel('test', { keyEncoding: 'view' })

    await sub.put(key, 'bar')
    t.same(await sub.get(key), 'bar')
  })

  // Also test default fallback implementations of keys() and values()
  for (const [mode, def] of [['iterator', false], ['keys', false], ['values', false], ['keys', true], ['values', true]]) {
    const Ctor = mode === 'iterator' || def ? AbstractIterator : mode === 'keys' ? AbstractKeyIterator : AbstractValueIterator
    const privateMethod = def ? '_iterator' : '_' + mode
    const publicMethod = mode

    t.test(`unfixing sublevel.${mode}() Buffer keys (default implementation: ${def})`, async function (t) {
      t.plan(3)

      const testKey = Buffer.from('00ff', 'hex')
      const prefixedKey = Buffer.concat([Buffer.from('!test!'), testKey])

      class MockIterator extends Ctor {
        async _next () {
          if (mode === 'iterator' || def) {
            return [prefixedKey, 'bar']
          } else if (mode === 'keys') {
            return prefixedKey
          } else {
            return 'bar'
          }
        }
      }

      class MockLevel extends AbstractLevel {
        [privateMethod] (options) {
          t.is(options.keyEncoding, 'buffer')
          t.is(options.valueEncoding, 'utf8')
          return new MockIterator(this, options)
        }
      }

      const db = new MockLevel({ encodings: { buffer: true, view: true, utf8: true } })
      const sub = db.sublevel('test', { keyEncoding: 'buffer' })
      const item = await sub[publicMethod]().next()

      if (mode === 'iterator') {
        t.same(item, [testKey, 'bar'])
      } else {
        t.same(item, mode === 'values' ? 'bar' : testKey)
      }
    })

    t.test(`unfixing sublevel.${mode}() Uint8Array keys (default implementation: ${def})`, async function (t) {
      t.plan(3)

      const testKey = new Uint8Array([0, 255])
      const textEncoder = new TextEncoder()
      const prefix = textEncoder.encode('!test!')
      const prefixedKey = new Uint8Array(prefix.byteLength + testKey.byteLength)

      prefixedKey.set(prefix, 0)
      prefixedKey.set(testKey, prefix.byteLength)

      class MockIterator extends Ctor {
        async _next () {
          if (mode === 'iterator' || def) {
            return [prefixedKey, 'bar']
          } else if (mode === 'keys') {
            return prefixedKey
          } else {
            return 'bar'
          }
        }
      }

      class MockLevel extends AbstractLevel {
        [privateMethod] (options) {
          t.is(options.keyEncoding, 'view')
          t.is(options.valueEncoding, 'utf8')
          return new MockIterator(this, options)
        }
      }

      const db = new MockLevel({ encodings: { buffer: true, view: true, utf8: true } })
      const sub = db.sublevel('test', { keyEncoding: 'view' })
      const item = await sub[publicMethod]().next()

      if (mode === 'iterator') {
        t.same(item, [testKey, 'bar'])
      } else {
        t.same(item, mode === 'values' ? 'bar' : testKey)
      }
    })

    mode === 'values' || t.test(`sublevel.${mode}() skips unfixing undefined keys (default implementation: ${def})`, async function (t) {
      // Note, this iterator technically returns invalid data
      class MockIterator extends Ctor {
        async _next () {
          if (mode === 'iterator' || def) {
            return [undefined, 'foo']
          } else {
            return undefined
          }
        }

        async _nextv () {
          if (mode === 'iterator' || def) {
            return [[undefined, 'foo']]
          } else {
            return [undefined]
          }
        }

        async _all () {
          if (mode === 'iterator' || def) {
            return [[undefined, 'foo']]
          } else {
            return [undefined]
          }
        }
      }

      class MockLevel extends AbstractLevel {
        [privateMethod] (options) {
          return new MockIterator(this, options)
        }
      }

      const db = new MockLevel({ encodings: { utf8: true } })
      const sub = db.sublevel('test')

      t.same(await sub[publicMethod]().next(), mode === 'iterator' ? [undefined, 'foo'] : undefined)
      t.same(await sub[publicMethod]().nextv(1), mode === 'iterator' ? [[undefined, 'foo']] : [undefined])
      t.same(await sub[publicMethod]().all(), mode === 'iterator' ? [[undefined, 'foo']] : [undefined])
    })
  }

  t.end()
})

for (const chained of [false, true]) {
  // Chained batch does not support deferred open
  for (const deferred of (chained ? [false] : [false, true])) {
    test(`batch() with sublevel per operation (chained: ${chained}, deferred: ${deferred})`, async function (t) {
      t.plan(6)

      class MockLevel extends AbstractLevel {
        async _batch (operations, options) {
          t.same(operations, [
            {
              type: 'put',
              sublevel: null,
              key: '!1!a',
              value: '{"foo":123}',
              keyEncoding: 'utf8',
              valueEncoding: 'utf8'
            },
            {
              type: 'put',
              sublevel: null,
              key: '!2!a-y',
              value: '[object Object]',
              keyEncoding: 'utf8',
              valueEncoding: 'utf8'
            },
            {
              type: 'put',
              sublevel: null,
              key: '!1!b',
              value: '[object Object]',
              keyEncoding: 'utf8',
              valueEncoding: 'utf8'
            },
            {
              type: 'put',
              sublevel: null,
              key: '!2!b',
              value: 'b',
              keyEncoding: 'utf8',
              valueEncoding: 'utf8'
            },
            {
              type: 'del',
              sublevel: null,
              key: '!2!c1',
              keyEncoding: 'utf8'
            },
            {
              type: 'del',
              sublevel: null,
              key: '!2!c2-y',
              keyEncoding: 'utf8'
            },
            {
              type: 'del',
              key: 'd-x',
              keyEncoding: 'utf8'
            }
          ])
          t.same(options, {})
        }
      }

      const db = new MockLevel({ encodings: { utf8: true } }, {
        keyEncoding: {
          encode: (key) => key + '-x',
          decode: (key) => key.slice(0, -2),
          name: 'x',
          format: 'utf8'
        }
      })

      const sub1 = db.sublevel('1', { valueEncoding: 'json' })
      const sub2 = db.sublevel('2', {
        keyEncoding: {
          encode: (key) => key + '-y',
          decode: (key) => key.slice(0, -2),
          name: 'y',
          format: 'utf8'
        }
      })

      if (!deferred) await sub1.open()

      t.is(sub1.keyEncoding().name, 'utf8')
      t.is(sub1.valueEncoding().name, 'json')
      t.is(sub2.keyEncoding().name, 'y')
      t.is(sub2.valueEncoding().name, 'utf8')

      if (chained) {
        await db.batch()
          // keyEncoding: utf8 (sublevel), valueEncoding: json (sublevel)
          .put('a', { foo: 123 }, { sublevel: sub1 })

          // keyEncoding: y (sublevel), valueEncoding: utf8 (sublevel)
          .put('a', { foo: 123 }, { sublevel: sub2 })

          // keyEncoding: utf8 (sublevel), valueEncoding: utf8 (operation)
          .put('b', { foo: 123 }, { sublevel: sub1, valueEncoding: 'utf8' })

          // keyEncoding: utf8 (operation), valueEncoding: utf8 (sublevel)
          .put('b', 'b', { sublevel: sub2, keyEncoding: 'utf8' })

          // keyEncoding: utf8 (operation)
          .del('c1', { sublevel: sub2, keyEncoding: 'utf8' })

          // keyEncoding: y (sublevel)
          .del('c2', { sublevel: sub2 })

          // keyEncoding: x (db). Should not affect sublevels.
          .del('d')
          .write()
      } else {
        await db.batch([
          { type: 'put', sublevel: sub1, key: 'a', value: { foo: 123 } },
          { type: 'put', sublevel: sub2, key: 'a', value: { foo: 123 } },
          { type: 'put', sublevel: sub1, key: 'b', value: { foo: 123 }, valueEncoding: 'utf8' },
          { type: 'put', sublevel: sub2, key: 'b', value: 'b', keyEncoding: 'utf8' },
          { type: 'del', key: 'c1', sublevel: sub2, keyEncoding: 'utf8' },
          { type: 'del', key: 'c2', sublevel: sub2 },
          { type: 'del', key: 'd' }
        ])
      }
    })
  }
}
