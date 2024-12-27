'use strict'

const { AbstractChainedBatch } = require('../abstract-chained-batch')

// Functional default for chained batch
class DefaultChainedBatch extends AbstractChainedBatch {
  #encoded = []

  constructor (db) {
    // Opt-in to _add() instead of _put() and _del()
    super(db, { add: true })
  }

  _add (op) {
    this.#encoded.push(op)
  }

  _clear () {
    this.#encoded = []
  }

  async _write (options) {
    // Need to call the private rather than public method, to prevent
    // recursion, double prefixing, double encoding and double hooks.
    return this.db._batch(this.#encoded, options)
  }
}

exports.DefaultChainedBatch = DefaultChainedBatch
