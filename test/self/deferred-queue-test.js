'use strict'

const test = require('tape')
const { DeferredQueue } = require('../../lib/deferred-queue')
const supported = !!globalThis.AbortController

test('DeferredQueue calls operations in FIFO order', async function (t) {
  const queue = new DeferredQueue()
  const calls = []

  queue.add(() => { calls.push(1) })
  queue.add(() => { calls.push(2) })
  queue.add(() => { calls.push(3) })

  queue.drain()
  t.same(calls, [1, 2, 3])
})

test('DeferredQueue only calls operation once', async function (t) {
  const queue = new DeferredQueue()

  let calls = 0
  queue.add(() => { calls++ })

  queue.drain()
  t.same(calls, 1)

  queue.drain()
  t.same(calls, 1, 'no new calls')
})

supported && test('DeferredQueue does not add operation if given an aborted signal', async function (t) {
  const ac = new globalThis.AbortController()
  const queue = new DeferredQueue()
  const calls = []

  ac.abort()
  queue.add((abortError) => { calls.push(abortError) }, { signal: ac.signal })

  t.is(calls.length, 1)
  t.is(calls[0].code, 'LEVEL_ABORTED')

  queue.drain()
  t.is(calls.length, 1, 'not called again')
})

supported && test('DeferredQueue aborts operation on signal abort', async function (t) {
  const ac1 = new globalThis.AbortController()
  const ac2 = new globalThis.AbortController()
  const queue = new DeferredQueue()
  const calls = []

  queue.add((abortError) => { calls.push([1, abortError]) }, { signal: ac1.signal })
  queue.add((abortError) => { calls.push([2, abortError]) }, { signal: ac2.signal })
  t.is(calls.length, 0, 'not yet called')

  ac1.abort()
  t.is(calls.length, 1, 'called')
  t.is(calls[0][0], 1, 'signal1')
  t.is(calls[0][1].code, 'LEVEL_ABORTED')

  ac2.abort()
  t.is(calls.length, 2, 'called')
  t.is(calls[1][0], 2, 'signal2')
  t.is(calls[1][1].code, 'LEVEL_ABORTED')

  queue.drain()
  ac2.abort()
  t.is(calls.length, 2, 'not called again')
})

supported && test('DeferredQueue calls operation if signal is not aborted', async function (t) {
  const ac1 = new globalThis.AbortController()
  const ac2 = new globalThis.AbortController()
  const queue = new DeferredQueue()
  const calls = []

  queue.add((abortError) => { calls.push([1, abortError]) }, { signal: ac1.signal })
  queue.add((abortError) => { calls.push([2, abortError]) }, { signal: ac2.signal })
  t.is(calls.length, 0, 'not yet called')

  queue.drain()
  t.is(calls.length, 2, 'called')
  t.is(calls[0][0], 1, 'signal1')
  t.is(calls[0][1], undefined, 'no abort error')
  t.is(calls[1][0], 2, 'signal2')
  t.is(calls[1][1], undefined, 'no abort error')

  queue.drain()
  ac1.abort()
  ac2.abort()
  t.is(calls.length, 2, 'not called again')
})
