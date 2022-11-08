'use strict'

const test = require('tape')
const { mockLevel } = require('../util')

test('resource must be an object with a close() method', async function (t) {
  t.plan(4)

  const db = mockLevel()

  for (const invalid of [null, undefined, {}, { close: 123 }]) {
    try {
      db.attachResource(invalid)
    } catch (err) {
      t.is(err && err.message, 'The first argument must be a resource object')
    }
  }

  return db.close()
})

test('resource is closed on failed open', function (t) {
  t.plan(2)

  const db = mockLevel({
    async _open (options) {
      t.pass('opened')
      throw new Error('_open error')
    }
  })

  const resource = {
    async close () {
      // Note: resource shouldn't care about db.status
      t.is(arguments.length, 0)
    }
  }

  db.attachResource(resource)
})

for (const open of [true, false]) {
  test(`resource is closed on db.close() (explicit open: ${open})`, async function (t) {
    t.plan(1)

    const db = mockLevel()

    const resource = {
      async close () {
        // Note: resource shouldn't care about db.status
        t.pass('closed')
      }
    }

    if (open) await db.open()
    db.attachResource(resource)
    return db.close()
  })

  test(`resource is not closed on db.close() if detached (explicit open: ${open})`, async function (t) {
    const db = mockLevel()

    const resource = {
      async close () {
        t.fail('should not be called')
      }
    }

    if (open) await db.open()
    db.attachResource(resource)
    db.detachResource(resource)
    return db.close()
  })
}
