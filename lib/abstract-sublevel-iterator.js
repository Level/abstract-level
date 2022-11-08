'use strict'

const { AbstractIterator, AbstractKeyIterator, AbstractValueIterator } = require('../abstract-iterator')

const kUnfix = Symbol('unfix')
const kIterator = Symbol('iterator')

// TODO: unfix natively if db supports it
class AbstractSublevelIterator extends AbstractIterator {
  constructor (db, options, iterator, unfix) {
    super(db, options)

    this[kIterator] = iterator
    this[kUnfix] = unfix
  }

  async _next () {
    const entry = await this[kIterator].next()

    if (entry !== undefined) {
      const key = entry[0]
      if (key !== undefined) entry[0] = this[kUnfix](key)
    }

    return entry
  }

  async _nextv (size, options) {
    const entries = await this[kIterator].nextv(size, options)
    const unfix = this[kUnfix]

    for (const entry of entries) {
      const key = entry[0]
      if (key !== undefined) entry[0] = unfix(key)
    }

    return entries
  }

  async _all (options) {
    const entries = await this[kIterator].all(options)
    const unfix = this[kUnfix]

    for (const entry of entries) {
      const key = entry[0]
      if (key !== undefined) entry[0] = unfix(key)
    }

    return entries
  }
}

class AbstractSublevelKeyIterator extends AbstractKeyIterator {
  constructor (db, options, iterator, unfix) {
    super(db, options)

    this[kIterator] = iterator
    this[kUnfix] = unfix
  }

  async _next () {
    const key = await this[kIterator].next()
    return key === undefined ? key : this[kUnfix](key)
  }

  async _nextv (size, options) {
    const keys = await this[kIterator].nextv(size, options)
    const unfix = this[kUnfix]

    for (let i = 0; i < keys.length; i++) {
      const key = keys[i]
      if (key !== undefined) keys[i] = unfix(key)
    }

    return keys
  }

  async _all (options) {
    const keys = await this[kIterator].all(options)
    const unfix = this[kUnfix]

    for (let i = 0; i < keys.length; i++) {
      const key = keys[i]
      if (key !== undefined) keys[i] = unfix(key)
    }

    return keys
  }
}

class AbstractSublevelValueIterator extends AbstractValueIterator {
  constructor (db, options, iterator) {
    super(db, options)
    this[kIterator] = iterator
  }

  async _next () {
    return this[kIterator].next()
  }

  async _nextv (size, options) {
    return this[kIterator].nextv(size, options)
  }

  async _all (options) {
    return this[kIterator].all(options)
  }
}

for (const Iterator of [AbstractSublevelIterator, AbstractSublevelKeyIterator, AbstractSublevelValueIterator]) {
  Iterator.prototype._seek = function (target, options) {
    this[kIterator].seek(target, options)
  }

  Iterator.prototype._close = async function () {
    return this[kIterator].close()
  }
}

exports.AbstractSublevelIterator = AbstractSublevelIterator
exports.AbstractSublevelKeyIterator = AbstractSublevelKeyIterator
exports.AbstractSublevelValueIterator = AbstractSublevelValueIterator
