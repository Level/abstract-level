'use strict'

const { AbstractIterator, AbstractKeyIterator, AbstractValueIterator } = require('../abstract-iterator')
const ModuleError = require('module-error')

const kNut = Symbol('nut')
const kUndefer = Symbol('undefer')
const kFactory = Symbol('factory')
const kSignalOptions = Symbol('signalOptions')

class DeferredIterator extends AbstractIterator {
  constructor (db, options) {
    super(db, options)

    this[kNut] = null
    this[kFactory] = () => db.iterator(options)
    this[kSignalOptions] = { signal: options.signal }

    this.db.defer(() => this[kUndefer](), this[kSignalOptions])
  }
}

class DeferredKeyIterator extends AbstractKeyIterator {
  constructor (db, options) {
    super(db, options)

    this[kNut] = null
    this[kFactory] = () => db.keys(options)
    this[kSignalOptions] = { signal: options.signal }

    this.db.defer(() => this[kUndefer](), this[kSignalOptions])
  }
}

class DeferredValueIterator extends AbstractValueIterator {
  constructor (db, options) {
    super(db, options)

    this[kNut] = null
    this[kFactory] = () => db.values(options)
    this[kSignalOptions] = { signal: options.signal }

    this.db.defer(() => this[kUndefer](), this[kSignalOptions])
  }
}

for (const Iterator of [DeferredIterator, DeferredKeyIterator, DeferredValueIterator]) {
  Iterator.prototype[kUndefer] = function () {
    if (this.db.status === 'open') {
      this[kNut] = this[kFactory]()
    }
  }

  Iterator.prototype._next = async function () {
    if (this[kNut] !== null) {
      return this[kNut].next()
    } else if (this.db.status === 'opening') {
      return this.db.deferAsync(() => this._next(), this[kSignalOptions])
    } else {
      throw new ModuleError('Iterator is not open: cannot call next() after close()', {
        code: 'LEVEL_ITERATOR_NOT_OPEN'
      })
    }
  }

  Iterator.prototype._nextv = async function (size, options) {
    if (this[kNut] !== null) {
      return this[kNut].nextv(size, options)
    } else if (this.db.status === 'opening') {
      return this.db.deferAsync(() => this._nextv(size, options), this[kSignalOptions])
    } else {
      throw new ModuleError('Iterator is not open: cannot call nextv() after close()', {
        code: 'LEVEL_ITERATOR_NOT_OPEN'
      })
    }
  }

  Iterator.prototype._all = async function (options) {
    if (this[kNut] !== null) {
      return this[kNut].all()
    } else if (this.db.status === 'opening') {
      return this.db.deferAsync(() => this._all(options), this[kSignalOptions])
    } else {
      throw new ModuleError('Iterator is not open: cannot call all() after close()', {
        code: 'LEVEL_ITERATOR_NOT_OPEN'
      })
    }
  }

  Iterator.prototype._seek = function (target, options) {
    if (this[kNut] !== null) {
      // TODO: explain why we need _seek() rather than seek() here
      this[kNut]._seek(target, options)
    } else if (this.db.status === 'opening') {
      this.db.defer(() => this._seek(target, options), this[kSignalOptions])
    }
  }

  Iterator.prototype._close = async function () {
    if (this[kNut] !== null) {
      return this[kNut].close()
    } else if (this.db.status === 'opening') {
      return this.db.deferAsync(() => this._close())
    }
  }
}

exports.DeferredIterator = DeferredIterator
exports.DeferredKeyIterator = DeferredKeyIterator
exports.DeferredValueIterator = DeferredValueIterator
