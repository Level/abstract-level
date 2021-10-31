'use strict'

const AbstractIterator = require('../abstract-iterator')
const ModuleError = require('module-error')

const kOptions = Symbol('options')
const kNut = Symbol('nut')
const kUndefer = Symbol('undefer')

class DeferredIterator extends AbstractIterator {
  constructor (db, options) {
    super(db, options)

    this[kOptions] = options
    this[kNut] = null

    this.db.defer(() => this[kUndefer]())
  }

  [kUndefer] () {
    if (this.db.status === 'open') {
      this[kNut] = this.db.iterator(this[kOptions])
    }
  }

  _next (callback) {
    if (this[kNut] !== null) {
      this[kNut].next(callback)
    } else if (this.db.status === 'opening') {
      this.db.defer(() => this._next(callback))
    } else {
      this.nextTick(callback, new ModuleError('Iterator is not open: cannot call next() after close()', {
        code: 'LEVEL_ITERATOR_NOT_OPEN'
      }))
    }
  }

  _seek (target, options) {
    if (this[kNut] !== null) {
      this[kNut]._seek(target, options)
    } else if (this.db.status === 'opening') {
      this.db.defer(() => this._seek(target, options))
    }
  }

  _close (callback) {
    if (this[kNut] !== null) {
      this[kNut].close(callback)
    } else if (this.db.status === 'opening') {
      this.db.defer(() => this._close(callback))
    } else {
      this.nextTick(callback)
    }
  }
}

module.exports = DeferredIterator
