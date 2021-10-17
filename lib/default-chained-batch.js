'use strict'

const AbstractChainedBatch = require('../abstract-chained-batch')
const kSerialized = Symbol('serialized')

// Functional default for chained batch, with support of deferred open
module.exports = class DefaultChainedBatch extends AbstractChainedBatch {
  constructor (db) {
    super(db)
    this[kSerialized] = []
  }

  _put (key, value, options) {
    this[kSerialized].push({ ...options, type: 'put', key, value })
  }

  _del (key, options) {
    this[kSerialized].push({ ...options, type: 'del', key })
  }

  _clear () {
    this[kSerialized] = []
  }

  // Assumes this[kSerialized] cannot change after write()
  _write (options, callback) {
    if (this.db.status === 'opening') {
      this.db.defer(() => this._write(options, callback))
    } else if (this.db.status === 'open') {
      this.db._batch(this[kSerialized], options, callback)
    } else {
      this.nextTick(callback, new Error('Batch is not open'))
    }
  }
}
