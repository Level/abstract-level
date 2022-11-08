'use strict'

const test = require('tape')
const { mockLevel } = require('../util')

test('defer() and deferAsync() require valid function argument', async function (t) {
  t.plan(6 * 2)

  const db = mockLevel()

  for (const invalid of [123, true, false, null, undefined, {}]) {
    try {
      db.defer(invalid)
    } catch (err) {
      t.is(err.message, 'The first argument must be a function')
    }

    try {
      await db.deferAsync(invalid)
    } catch (err) {
      t.is(err.message, 'The first argument must be a function')
    }
  }

  return db.close()
})

test('defer() custom operation', async function (t) {
  t.plan(3)

  const db = mockLevel({
    custom (arg) {
      t.is(this.status, 'opening')
      t.is(arg, 123)

      this.defer(() => {
        t.is(this.status, 'open')
      })
    }
  })

  db.custom(123)
  await db.open()

  return db.close()
})

test('deferAsync() custom operation', async function (t) {
  t.plan(4)

  const db = mockLevel({
    async custom (arg) {
      if (this.status === 'opening') {
        t.is(arg, 123)
        return this.deferAsync(() => this.custom(456))
      } else {
        t.is(db.status, 'open')
        t.is(arg, 456)
        return 987
      }
    }
  })

  const result = await db.custom(123)
  t.is(result, 987, 'result ok')

  return db.close()
})

test('deferAsync() custom operation with promise rejection', async function (t) {
  t.plan(4)

  const db = mockLevel({
    async custom (arg) {
      if (this.status === 'opening') {
        t.is(arg, 123)
        return this.deferAsync(() => this.custom(456))
      } else {
        t.is(db.status, 'open')
        t.is(arg, 456)
        throw new Error('test')
      }
    }
  })

  try {
    await db.custom(123)
  } catch (err) {
    t.is(err.message, 'test', 'got error')
  }

  return db.close()
})

test('deferAsync() custom operation with failed open', async function (t) {
  t.plan(3)

  const db = mockLevel({
    async _open (options) {
      t.pass('opened')
      throw new Error('_open error')
    },
    async custom (arg) {
      if (this.status === 'opening') {
        return this.deferAsync(() => this.custom(arg))
      } else {
        t.is(db.status, 'closed')
        throw new Error('Database is not open (from custom)')
      }
    }
  })

  try {
    await db.custom()
  } catch (err) {
    t.is(err.message, 'Database is not open (from custom)')
  }
})

test('defer() can drop custom synchronous operation', function (t) {
  t.plan(3)

  const db = mockLevel({
    async _open (options) {
      t.pass('opened')
      throw new Error('_open error')
    },
    custom (arg) {
      if (this.status === 'opening') {
        this.defer(() => this.custom(arg * 2))
      } else {
        // Handling other states is a userland responsibility
        t.is(db.status, 'closed')
        t.is(arg, 246)
      }
    }
  })

  db.custom(123)
})
