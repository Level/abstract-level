'use strict'

const { AbstractIterator, AbstractKeyIterator, AbstractValueIterator } = require('../abstract-iterator')

// TODO: unfix natively if db supports it
class AbstractSublevelIterator extends AbstractIterator {
  #iterator
  #unfix

  constructor (db, options, iterator, unfix) {
    super(db, options)

    this.#iterator = iterator
    this.#unfix = unfix
  }

  async _next () {
    const entry = await this.#iterator.next()

    if (entry !== undefined) {
      const key = entry[0]
      if (key !== undefined) entry[0] = this.#unfix(key)
    }

    return entry
  }

  async _nextv (size, options) {
    const entries = await this.#iterator.nextv(size, options)
    const unfix = this.#unfix

    for (const entry of entries) {
      const key = entry[0]
      if (key !== undefined) entry[0] = unfix(key)
    }

    return entries
  }

  async _all (options) {
    const entries = await this.#iterator.all(options)
    const unfix = this.#unfix

    for (const entry of entries) {
      const key = entry[0]
      if (key !== undefined) entry[0] = unfix(key)
    }

    return entries
  }

  _seek (target, options) {
    this.#iterator.seek(target, options)
  }

  async _close () {
    return this.#iterator.close()
  }
}

class AbstractSublevelKeyIterator extends AbstractKeyIterator {
  #iterator
  #unfix

  constructor (db, options, iterator, unfix) {
    super(db, options)

    this.#iterator = iterator
    this.#unfix = unfix
  }

  async _next () {
    const key = await this.#iterator.next()
    return key === undefined ? key : this.#unfix(key)
  }

  async _nextv (size, options) {
    const keys = await this.#iterator.nextv(size, options)
    const unfix = this.#unfix

    for (let i = 0; i < keys.length; i++) {
      const key = keys[i]
      if (key !== undefined) keys[i] = unfix(key)
    }

    return keys
  }

  async _all (options) {
    const keys = await this.#iterator.all(options)
    const unfix = this.#unfix

    for (let i = 0; i < keys.length; i++) {
      const key = keys[i]
      if (key !== undefined) keys[i] = unfix(key)
    }

    return keys
  }

  _seek (target, options) {
    this.#iterator.seek(target, options)
  }

  async _close () {
    return this.#iterator.close()
  }
}

class AbstractSublevelValueIterator extends AbstractValueIterator {
  #iterator

  constructor (db, options, iterator) {
    super(db, options)
    this.#iterator = iterator
  }

  async _next () {
    return this.#iterator.next()
  }

  async _nextv (size, options) {
    return this.#iterator.nextv(size, options)
  }

  async _all (options) {
    return this.#iterator.all(options)
  }

  _seek (target, options) {
    this.#iterator.seek(target, options)
  }

  async _close () {
    return this.#iterator.close()
  }
}

exports.AbstractSublevelIterator = AbstractSublevelIterator
exports.AbstractSublevelKeyIterator = AbstractSublevelKeyIterator
exports.AbstractSublevelValueIterator = AbstractSublevelValueIterator
