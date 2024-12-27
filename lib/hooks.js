'use strict'

const { noop } = require('./common')

class DatabaseHooks {
  constructor () {
    this.postopen = new Hook({ async: true })
    this.prewrite = new Hook({ async: false })
    this.newsub = new Hook({ async: false })
  }
}

class Hook {
  #functions = new Set()
  #isAsync

  constructor (options) {
    this.#isAsync = options.async

    // Offer a fast way to check if hook functions are present. We could also expose a
    // size getter, which would be slower, or check it by hook.run !== noop, which would
    // not allow userland to do the same check.
    this.noop = true
    this.run = this.#runner()
  }

  add (fn) {
    // Validate now rather than in asynchronous code paths
    assertFunction(fn)
    this.#functions.add(fn)
    this.noop = false
    this.run = this.#runner()
  }

  delete (fn) {
    assertFunction(fn)
    this.#functions.delete(fn)
    this.noop = this.#functions.size === 0
    this.run = this.#runner()
  }

  #runner () {
    if (this.noop) {
      return noop
    } else if (this.#functions.size === 1) {
      const [fn] = this.#functions
      return fn
    } else if (this.#isAsync) {
      // The run function should not reference hook, so that consumers like chained batch
      // and db.open() can save a reference to hook.run and safely assume it won't change
      // during their lifetime or async work.
      const run = async function (functions, ...args) {
        for (const fn of functions) {
          await fn(...args)
        }
      }

      return run.bind(null, Array.from(this.#functions))
    } else {
      const run = function (functions, ...args) {
        for (const fn of functions) {
          fn(...args)
        }
      }

      return run.bind(null, Array.from(this.#functions))
    }
  }
}

const assertFunction = function (fn) {
  if (typeof fn !== 'function') {
    const hint = fn === null ? 'null' : typeof fn
    throw new TypeError(`The first argument must be a function, received ${hint}`)
  }
}

exports.DatabaseHooks = DatabaseHooks
