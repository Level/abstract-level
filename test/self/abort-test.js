'use strict'

const test = require('tape')
const real = require('../../lib/abort')
const ponyfill = require('../../lib/abort-ponyfill')

test('AbortController', function (t) {
  verify(t, real)
})

test('AbortController ponyfill', function (t) {
  verify(t, ponyfill)
})

function verify (t, src) {
  const controller = new src.AbortController()

  t.ok(controller.signal instanceof src.AbortSignal)
  t.is(controller.signal.aborted, false)

  t.is(controller.abort(), undefined)
  t.is(controller.signal.aborted, true)

  t.is(controller.abort(), undefined)
  t.is(controller.signal.aborted, true)

  t.end()
}
