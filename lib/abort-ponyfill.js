'use strict'

const kAbort = Symbol('abort')
const kAborted = Symbol('aborted')

// Minimal ponyfill. Scope is TBD.
exports.AbortController = class AbortController {
  constructor () {
    this.signal = new exports.AbortSignal()
  }

  abort () {
    this.signal[kAbort]()
  }
}

exports.AbortSignal = class AbortSignal {
  constructor () {
    this[kAborted] = false
  }

  get aborted () {
    return this[kAborted]
  }

  [kAbort] () {
    this[kAborted] = true
  }
}
