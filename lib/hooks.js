'use strict'

const { noop } = require('./common')

const kFunctions = Symbol('functions')
const kAsync = Symbol('async')

class DatabaseHooks {
  constructor () {
    this.postopen = new Hook({ async: true })
    this.prewrite = new Hook({ async: false })
    this.newsub = new Hook({ async: false })
  }
}

class Hook {
  constructor (options) {
    this[kAsync] = options.async
    this[kFunctions] = new Set()

    // Offer a fast way to check if hook functions are present. We could also expose a
    // size getter, which would be slower, or check it by hook.run !== noop, which would
    // not allow userland to do the same check.
    this.noop = true
    this.run = runner(this)
  }

  add (fn) {
    // Validate now rather than in asynchronous code paths
    assertFunction(fn)
    this[kFunctions].add(fn)
    this.noop = false
    this.run = runner(this)
  }

  delete (fn) {
    assertFunction(fn)
    this[kFunctions].delete(fn)
    this.noop = this[kFunctions].size === 0
    this.run = runner(this)
  }
}

const assertFunction = function (fn) {
  if (typeof fn !== 'function') {
    const hint = fn === null ? 'null' : typeof fn
    throw new TypeError(`The first argument must be a function, received ${hint}`)
  }
}

const runner = function (hook) {
  if (hook.noop) {
    return noop
  } else if (hook[kFunctions].size === 1) {
    const [fn] = hook[kFunctions]
    return fn
  } else if (hook[kAsync]) {
    // The run function should not reference hook, so that consumers like chained batch
    // and db.open() can save a reference to hook.run and safely assume it won't change
    // during their lifetime or async work.
    const run = async function (functions, ...args) {
      for (const fn of functions) {
        await fn(...args)
      }
    }

    return run.bind(null, Array.from(hook[kFunctions]))
  } else {
    const run = function (functions, ...args) {
      for (const fn of functions) {
        fn(...args)
      }
    }

    return run.bind(null, Array.from(hook[kFunctions]))
  }
}

exports.DatabaseHooks = DatabaseHooks
