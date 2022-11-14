'use strict'

const { AbstractChainedBatch } = require('../abstract-chained-batch')
const kEncoded = Symbol('encoded')

// Functional default for chained batch
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
    // Need to call the private rather than public method, to prevent
    // recursion, double prefixing, double encoding and double hooks.
    return this.db._batch(this[kEncoded], options)
  }
}

exports.DefaultChainedBatch = DefaultChainedBatch
