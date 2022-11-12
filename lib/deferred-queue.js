'use strict'

const { getOptions, emptyOptions } = require('./common')
const { AbortError } = require('./errors')

const kOperations = Symbol('operations')
const kSignals = Symbol('signals')
const kHandleAbort = Symbol('handleAbort')

class DeferredOperation {
  constructor (fn, signal) {
    this.fn = fn
    this.signal = signal
  }
}

class DeferredQueue {
  constructor () {
    this[kOperations] = []
    this[kSignals] = new Set()
    this[kHandleAbort] = this[kHandleAbort].bind(this)
  }

  add (fn, options) {
    options = getOptions(options, emptyOptions)
    const signal = options.signal

    if (signal == null) {
      this[kOperations].push(new DeferredOperation(fn, null))
      return
    }

    if (signal.aborted) {
      // Note that this is called in the same tick
      fn(new AbortError())
      return
    }

    if (!this[kSignals].has(signal)) {
      this[kSignals].add(signal)
      signal.addEventListener('abort', this[kHandleAbort], { once: true })
    }

    this[kOperations].push(new DeferredOperation(fn, signal))
  }

  drain () {
    const operations = this[kOperations]
    const signals = this[kSignals]

    this[kOperations] = []
    this[kSignals] = new Set()

    for (const signal of signals) {
      signal.removeEventListener('abort', this[kHandleAbort])
    }

    for (const operation of operations) {
      operation.fn.call(null)
    }
  }

  [kHandleAbort] (ev) {
    const signal = ev.target
    const err = new AbortError()
    const aborted = []

    // TODO: optimize
    this[kOperations] = this[kOperations].filter(function (operation) {
      if (operation.signal !== null && operation.signal === signal) {
        aborted.push(operation)
        return false
      } else {
        return true
      }
    })

    this[kSignals].delete(signal)

    for (const operation of aborted) {
      operation.fn.call(null, err)
    }
  }
}

exports.DeferredQueue = DeferredQueue
