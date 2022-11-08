'use strict'

const { AbstractChainedBatch } = require('../abstract-chained-batch')
const ModuleError = require('module-error')
const kEncoded = Symbol('encoded')

// Functional default for chained batch, with support of deferred open
class DefaultChainedBatch extends AbstractChainedBatch {
  constructor (db) {
    // Opt-in to _add() instead of _put() and _del()
    super(db, { add: true })
    this[kEncoded] = []
  }

  _add (op) {
    this[kEncoded].push(op)
  }

  _clear () {
    this[kEncoded] = []
  }

  async _write (options) {
    if (this.db.status === 'opening') {
      return this.db.deferAsync(() => this._write(options))
    } else if (this.db.status === 'open') {
      if (this[kEncoded].length === 0) return

      // Need to call the private rather than public method, to prevent
      // recursion, double prefixing, double encoding and double hooks.
      return this.db._batch(this[kEncoded], options)
    } else {
      throw new ModuleError('Batch is not open: cannot call write() after write() or close()', {
        code: 'LEVEL_BATCH_NOT_OPEN'
      })
    }
  }
}

exports.DefaultChainedBatch = DefaultChainedBatch
