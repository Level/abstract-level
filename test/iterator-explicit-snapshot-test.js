'use strict'

const traits = require('./traits')

exports.traits = function (test, testCommon) {
  // TODO: document (or fix...) that deferred open is not supported
  traits.open('snapshot()', testCommon, { deferred: false }, async function (t, db) {
    const snapshot = db.snapshot()
    return snapshot.close()
  })

  traits.closed('snapshot()', testCommon, async function (t, db) {
    db.snapshot()
  })
}

exports.get = function (test, testCommon) {
  const { testFresh, testClose } = testFactory(test, testCommon)

  testFresh('get() changed entry from snapshot', async function (t, db) {
    await db.put('abc', 'before')
    const snapshot = db.snapshot()
    await db.put('abc', 'after')

    t.is(await db.get('abc'), 'after')
    t.is(await db.get('abc', { snapshot }), 'before')
    t.is(await db.get('other', { snapshot }), undefined)

    if (testCommon.supports.getSync) {
      t.is(db.getSync('abc'), 'after')
      t.is(db.getSync('abc', { snapshot }), 'before')
      t.is(db.getSync('other', { snapshot }), undefined)
    }

    return snapshot.close()
  })

  testFresh('get() deleted entry from snapshot', async function (t, db) {
    await db.put('abc', 'before')
    const snapshot = db.snapshot()
    await db.del('abc')

    t.is(await db.get('abc'), undefined)
    t.is(await db.get('abc', { snapshot }), 'before')
    t.is(await db.get('other', { snapshot }), undefined)

    if (testCommon.supports.getSync) {
      t.is(db.getSync('abc'), undefined)
      t.is(db.getSync('abc', { snapshot }), 'before')
      t.is(db.getSync('other', { snapshot }), undefined)
    }

    return snapshot.close()
  })

  testFresh('get() non-existent entry from snapshot', async function (t, db) {
    const snapshot = db.snapshot()
    await db.put('abc', 'after')

    t.is(await db.get('abc'), 'after')
    t.is(await db.get('abc', { snapshot }), undefined)

    if (testCommon.supports.getSync) {
      t.is(db.getSync('abc'), 'after')
      t.is(db.getSync('abc', { snapshot }), undefined)
    }

    return snapshot.close()
  })

  testFresh('get() entries from multiple snapshots', async function (t, db) {
    const snapshots = []
    const iterations = 100

    for (let i = 0; i < iterations; i++) {
      await db.put('number', i.toString())
      snapshots.push(db.snapshot())
    }

    for (let i = 0; i < iterations; i++) {
      const snapshot = snapshots[i]
      const value = i.toString()

      t.is(await db.get('number', { snapshot }), value)

      if (testCommon.supports.getSync) {
        t.is(db.getSync('number', { snapshot }), value)
      }
    }

    return Promise.all(snapshots.map(x => x.close()))
  })

  testFresh('get() entries from snapshot after closing another', async function (t, db) {
    await db.put('abc', 'before')

    const snapshot1 = db.snapshot()
    const snapshot2 = db.snapshot()

    await db.put('abc', 'after')
    await snapshot1.close()

    // Closing one snapshot should not affect the other
    t.is(await db.get('abc', { snapshot: snapshot2 }), 'before')

    if (testCommon.supports.getSync) {
      t.is(db.getSync('abc', { snapshot: snapshot2 }), 'before')
    }

    return snapshot2.close()
  })

  testClose('get()', async function (db, snapshot) {
    return db.get('xyz', { snapshot })
  })

  if (testCommon.supports.getSync) {
    testClose('getSync()', async function (db, snapshot) {
      return db.getSync('xyz', { snapshot })
    })
  }
}

exports.getMany = function (test, testCommon) {
  const { testFresh, testClose } = testFactory(test, testCommon)

  testFresh('getMany() entries from snapshot', async function (t, db) {
    t.plan(3)

    await db.put('a', '1')
    await db.put('b', '2')
    await db.put('c', '3')

    const snapshot = db.snapshot()

    await db.put('a', 'abc')
    await db.del('b')
    await db.put('c', 'xyz')

    t.same(await db.getMany(['a', 'b', 'c']), ['abc', undefined, 'xyz'])
    t.same(await db.getMany(['a', 'b', 'c'], { snapshot }), ['1', '2', '3'])
    t.same(await db.getMany(['a', 'b', 'c']), ['abc', undefined, 'xyz'], 'no side effects')

    return snapshot.close()
  })

  testClose('getMany()', async function (db, snapshot) {
    return db.getMany(['xyz'], { snapshot })
  })
}

exports.iterator = function (test, testCommon) {
  const { testFresh, testClose } = testFactory(test, testCommon)

  testFresh('iterator(), keys(), values() with snapshot', async function (t, db) {
    t.plan(10)

    await db.put('a', '1')
    await db.put('b', '2')
    await db.put('c', '3')

    const snapshot = db.snapshot()

    await db.put('a', 'after')
    await db.del('b')
    await db.put('c', 'after')
    await db.put('d', 'after')

    t.same(
      await db.iterator().all(),
      [['a', 'after'], ['c', 'after'], ['d', 'after']],
      'data was written'
    )

    for (const fn of [all, nextv, next]) {
      t.same(await fn(db.iterator({ snapshot })), [['a', '1'], ['b', '2'], ['c', '3']], 'iterator')
      t.same(await fn(db.keys({ snapshot })), ['a', 'b', 'c'], 'keys')
      t.same(await fn(db.values({ snapshot })), ['1', '2', '3'], 'values')
    }

    async function all (iterator) {
      return iterator.all()
    }

    async function nextv (iterator) {
      try {
        return iterator.nextv(10)
      } finally {
        await iterator.close()
      }
    }

    async function next (iterator) {
      try {
        const entries = []
        let entry

        while ((entry = await iterator.next()) !== undefined) {
          entries.push(entry)
        }

        return entries
      } finally {
        await iterator.close()
      }
    }

    return snapshot.close()
  })

  // Test that every iterator type and read method checks snapshot state
  for (const type of ['iterator', 'keys', 'values']) {
    testClose(`${type}().all()`, async function (db, snapshot) {
      return db[type]({ snapshot }).all()
    })

    testClose(`${type}().next()`, async function (db, snapshot) {
      const iterator = db[type]({ snapshot })

      try {
        await iterator.next()
      } finally {
        iterator.close()
      }
    })

    testClose(`${type}().nextv()`, async function (db, snapshot) {
      const iterator = db[type]({ snapshot })

      try {
        await iterator.nextv(10)
      } finally {
        iterator.close()
      }
    })
  }
}

exports.clear = function (test, testCommon) {
  const { testFresh, testClose } = testFactory(test, testCommon)

  testFresh('clear() entries from snapshot', async function (t, db) {
    t.plan(2)

    await db.put('a', 'xyz')
    const snapshot = db.snapshot()

    await db.put('b', 'xyz')
    await db.clear({ snapshot })

    t.same(await db.keys().all(), ['b'])
    t.same(await db.keys({ snapshot }).all(), ['a'])

    return snapshot.close()
  })

  testFresh('clear() entries from empty snapshot', async function (t, db) {
    t.plan(2)

    const snapshot = db.snapshot()

    await db.put('a', 'xyz')
    await db.clear({ snapshot })

    t.same(await db.keys().all(), ['a'])
    t.same(await db.keys({ snapshot }).all(), [])

    return snapshot.close()
  })

  testClose('clear()', async function (db, snapshot) {
    return db.clear({ snapshot })
  })
}

exports.cleanup = function (test, testCommon) {
  test('snapshot is closed on database close', async function (t) {
    t.plan(1)

    const db = testCommon.factory()
    await db.open()
    const snapshot = db.snapshot()
    const promise = db.close()

    try {
      snapshot.ref()
    } catch (err) {
      t.is(err.code, 'LEVEL_SNAPSHOT_NOT_OPEN')
    }

    return promise
  })

  test('snapshot is closed along with iterator', async function (t) {
    t.plan(2)

    const db = testCommon.factory()
    await db.open()
    await db.put('beep', 'boop')

    // These resources have a potentially tricky relationship. If all is well,
    // db.close() calls both snapshot.close() and iterator.close() in parallel,
    // and snapshot.close() and iterator.close() wait on the read. Crucially,
    // closing the snapshot only waits for individual operations on the iterator
    // rather than for the entire iterator to be closed (which may never happen).
    const snapshot = db.snapshot()
    const iterator = db.iterator({ snapshot })
    const readPromise = iterator.all()
    const closePromise = db.close()

    try {
      snapshot.ref()
    } catch (err) {
      t.is(err.code, 'LEVEL_SNAPSHOT_NOT_OPEN', 'snapshot is closing')
    }

    try {
      await iterator.next()
    } catch (err) {
      // Effectively also asserts that the LEVEL_ITERATOR_NOT_OPEN error takes
      // precedence over LEVEL_SNAPSHOT_NOT_OPEN.
      t.is(err.code, 'LEVEL_ITERATOR_NOT_OPEN', 'iterator is closing')
    }

    return Promise.all([readPromise, closePromise])
  })
}

exports.dispose = function (test, testCommon) {
  // Can't use the syntax yet (https://github.com/tc39/proposal-explicit-resource-management)
  Symbol.asyncDispose && test('Symbol.asyncDispose', async function (t) {
    const db = testCommon.factory()
    await db.open()

    const snapshot = db.snapshot()
    await snapshot[Symbol.asyncDispose]()

    return db.close()
  })
}

exports.all = function (test, testCommon) {
  exports.traits(test, testCommon)
  exports.get(test, testCommon)
  exports.getMany(test, testCommon)
  exports.iterator(test, testCommon)
  exports.clear(test, testCommon)
  exports.cleanup(test, testCommon)
  exports.dispose(test, testCommon)
}

function testFactory (test, testCommon) {
  const testFresh = function (name, run) {
    test(name, async function (t) {
      const db = testCommon.factory()
      await db.open()
      await run(t, db)
      return db.close()
    })
  }

  const testClose = function (name, run) {
    testFresh(`${name} after closing snapshot`, async function (t, db) {
      t.plan(1)

      const snapshot = db.snapshot()
      await snapshot.close()

      try {
        await run(db, snapshot)
      } catch (err) {
        t.is(err.code, 'LEVEL_SNAPSHOT_NOT_OPEN')
      }
    })

    testFresh(`${name} while closing snapshot`, async function (t, db) {
      t.plan(1)

      const snapshot = db.snapshot()
      const promise = snapshot.close()

      try {
        await run(db, snapshot)
      } catch (err) {
        t.is(err.code, 'LEVEL_SNAPSHOT_NOT_OPEN')
      }

      return promise
    })
  }

  return { testFresh, testClose }
}
