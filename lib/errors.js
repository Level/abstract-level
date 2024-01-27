'use strict'

const ModuleError = require('module-error')

class AbortError extends ModuleError {
  constructor (cause) {
    super('Operation has been aborted', {
      code: 'LEVEL_ABORTED',
      cause
    })
  }

  // Set name to AbortError for web compatibility. See:
  // https://dom.spec.whatwg.org/#aborting-ongoing-activities
  // https://github.com/nodejs/node/pull/35911#discussion_r515779306
  get name () {
    return 'AbortError'
  }
}

exports.AbortError = AbortError
