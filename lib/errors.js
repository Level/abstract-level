'use strict'

const ModuleError = require('module-error')

class AbortError extends ModuleError {
  constructor (cause) {
    super('Operation has been aborted', {
      code: 'LEVEL_ABORTED',
      cause
    })
  }

  // TODO: we should set name to AbortError for web compatibility. See:
  // https://dom.spec.whatwg.org/#aborting-ongoing-activities
  // https://github.com/nodejs/node/pull/35911#discussion_r515779306
  //
  // But I'm not sure we can do the same for errors created by a Node-API addon (like
  // classic-level) so for now this behavior is undocumented and folks should use the
  // LEVEL_ABORTED code instead.
  get name () {
    return 'AbortError'
  }
}

exports.AbortError = AbortError
