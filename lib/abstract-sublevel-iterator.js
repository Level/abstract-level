'use strict'

const { AbstractIterator } = require('../abstract-iterator')

const kUnfix = Symbol('unfix')
const kIterator = Symbol('iterator')
const kNext = Symbol('next')
const kCallback = Symbol('callback')

class AbstractSublevelIterator extends AbstractIterator {
  constructor (db, options, iterator, unfix) {
    super(db, options)

    // TODO: do this natively if db supports it
    this[kUnfix] = unfix
    this[kIterator] = iterator
    this[kNext] = this[kNext].bind(this)
    this[kCallback] = null
  }

  _next (callback) {
    this[kCallback] = callback
    this[kIterator].next(this[kNext])
  }

  [kNext] (err, key, value) {
    const callback = this[kCallback]
    if (err) return callback(err)
    if (key !== undefined) key = this[kUnfix](key)
    callback(err, key, value)
  }

  _seek (target, options) {
    this[kIterator].seek(target, options)
  }

  _close (callback) {
    this[kIterator].close(callback)
  }
}

exports.AbstractSublevelIterator = AbstractSublevelIterator
