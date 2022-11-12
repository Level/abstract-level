'use strict'

const ModuleError = require('module-error')
const deprecations = new Set()

exports.getOptions = function (options, def) {
  if (typeof options === 'object' && options !== null) {
    return options
  }

  if (def !== undefined) {
    return def
  }

  return {}
}

exports.emptyOptions = Object.freeze({})
exports.noop = function () {}
exports.resolvedPromise = Promise.resolve()

exports.deprecate = function (message) {
  if (!deprecations.has(message)) {
    deprecations.add(message)

    // Avoid polyfills
    const c = globalThis.console

    if (typeof c !== 'undefined' && typeof c.warn === 'function') {
      c.warn(new ModuleError(message, { code: 'LEVEL_LEGACY' }))
    }
  }
}
