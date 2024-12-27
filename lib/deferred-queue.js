'use strict'

const { getOptions, emptyOptions } = require('./common')
const { AbortError } = require('./errors')

class DeferredOperation {
  constructor (fn, signal) {
    this.fn = fn
    this.signal = signal
  }
}

class DeferredQueue {
  #operations
  #signals

  constructor () {
    this.#operations = []
    this.#signals = new Set()
  }

  add (fn, options) {
    options = getOptions(options, emptyOptions)
    const signal = options.signal

    if (signal == null) {
      this.#operations.push(new DeferredOperation(fn, null))
      return
    }

    if (signal.aborted) {
      // Note that this is called in the same tick
      fn(new AbortError())
      return
    }

    if (!this.#signals.has(signal)) {
      this.#signals.add(signal)
      signal.addEventListener('abort', this.#handleAbort, { once: true })
    }

    this.#operations.push(new DeferredOperation(fn, signal))
  }

  drain () {
    const operations = this.#operations
    const signals = this.#signals

    this.#operations = []
    this.#signals = new Set()

    for (const signal of signals) {
      signal.removeEventListener('abort', this.#handleAbort)
    }

    for (const operation of operations) {
      operation.fn.call(null)
    }
  }

  #handleAbort = (ev) => {
    const signal = ev.target
    const err = new AbortError()
    const aborted = []

    // TODO: optimize
    this.#operations = this.#operations.filter(function (operation) {
      if (operation.signal !== null && operation.signal === signal) {
        aborted.push(operation)
        return false
      } else {
        return true
      }
    })

    this.#signals.delete(signal)

    for (const operation of aborted) {
      operation.fn.call(null, err)
    }
  }
}

exports.DeferredQueue = DeferredQueue
