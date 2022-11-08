'use strict'

const { AbstractKeyIterator, AbstractValueIterator } = require('../abstract-iterator')

const kIterator = Symbol('iterator')
const kHandleOne = Symbol('handleOne')
const kHandleMany = Symbol('handleMany')

class DefaultKeyIterator extends AbstractKeyIterator {
  constructor (db, options) {
    super(db, options)

    this[kIterator] = db.iterator({ ...options, keys: true, values: false })
  }

  [kHandleOne] (entry) {
    return entry[0]
  }

  [kHandleMany] (entries) {
    for (let i = 0; i < entries.length; i++) {
      entries[i] = entries[i][0]
    }
  }
}

class DefaultValueIterator extends AbstractValueIterator {
  constructor (db, options) {
    super(db, options)

    this[kIterator] = db.iterator({ ...options, keys: false, values: true })
  }

  [kHandleOne] (entry) {
    return entry[1]
  }

  [kHandleMany] (entries) {
    for (let i = 0; i < entries.length; i++) {
      entries[i] = entries[i][1]
    }
  }
}

for (const Iterator of [DefaultKeyIterator, DefaultValueIterator]) {
  Iterator.prototype._next = async function () {
    const entry = await this[kIterator].next()
    return entry === undefined ? entry : this[kHandleOne](entry)
  }

  Iterator.prototype._nextv = async function (size, options) {
    const entries = await this[kIterator].nextv(size, options)
    this[kHandleMany](entries)
    return entries
  }

  Iterator.prototype._all = async function (options) {
    const entries = await this[kIterator].all(options)
    this[kHandleMany](entries)
    return entries
  }

  Iterator.prototype._seek = function (target, options) {
    this[kIterator].seek(target, options)
  }

  Iterator.prototype._close = async function () {
    return this[kIterator].close()
  }
}

// Internal utilities, should be typed as AbstractKeyIterator and AbstractValueIterator
exports.DefaultKeyIterator = DefaultKeyIterator
exports.DefaultValueIterator = DefaultValueIterator
