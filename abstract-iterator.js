'use strict'

const ModuleError = require('module-error')
const combineErrors = require('maybe-combine-errors')
const { getOptions, emptyOptions, noop } = require('./lib/common')
const { AbortError } = require('./lib/errors')

const kDecodeOne = Symbol('decodeOne')
const kDecodeMany = Symbol('decodeMany')
const kKeyEncoding = Symbol('keyEncoding')
const kValueEncoding = Symbol('valueEncoding')

// This class is an internal utility for common functionality between AbstractIterator,
// AbstractKeyIterator and AbstractValueIterator. It's not exported.
class CommonIterator {
  #working = false
  #pendingClose = null
  #closingPromise = null
  #count = 0
  #signal
  #limit
  #ended
  #snapshot

  constructor (db, options) {
    if (typeof db !== 'object' || db === null) {
      const hint = db === null ? 'null' : typeof db
      throw new TypeError(`The first argument must be an abstract-level database, received ${hint}`)
    }

    if (typeof options !== 'object' || options === null) {
      throw new TypeError('The second argument must be an options object')
    }

    this[kKeyEncoding] = options[kKeyEncoding]
    this[kValueEncoding] = options[kValueEncoding]

    this.#limit = Number.isInteger(options.limit) && options.limit >= 0 ? options.limit : Infinity
    this.#signal = options.signal != null ? options.signal : null
    this.#snapshot = options.snapshot != null ? options.snapshot : null

    // Ending means reaching the natural end of the data and (unlike closing) that can
    // be reset by seek(), unless the limit was reached.
    this.#ended = false

    this.db = db
    this.db.attachResource(this)
  }

  get count () {
    return this.#count
  }

  get limit () {
    return this.#limit
  }

  async next () {
    this.#startWork()

    try {
      if (this.#ended || this.#count >= this.#limit) {
        this.#ended = true
        return undefined
      }

      let item = await this._next()

      if (item === undefined) {
        this.#ended = true
        return undefined
      }

      try {
        item = this[kDecodeOne](item)
      } catch (err) {
        throw new IteratorDecodeError(err)
      }

      this.#count++
      return item
    } finally {
      this.#endWork()
    }
  }

  async _next () {}

  async nextv (size, options) {
    if (!Number.isInteger(size)) {
      throw new TypeError("The first argument 'size' must be an integer")
    }

    options = getOptions(options, emptyOptions)

    if (size < 1) size = 1
    if (this.#limit < Infinity) size = Math.min(size, this.#limit - this.#count)

    this.#startWork()

    try {
      if (this.#ended || size <= 0) {
        this.#ended = true
        return []
      }

      const items = await this._nextv(size, options)

      if (items.length === 0) {
        this.#ended = true
        return items
      }

      try {
        this[kDecodeMany](items)
      } catch (err) {
        throw new IteratorDecodeError(err)
      }

      this.#count += items.length
      return items
    } finally {
      this.#endWork()
    }
  }

  async _nextv (size, options) {
    const acc = []

    while (acc.length < size) {
      const item = await this._next(options)

      if (item !== undefined) {
        acc.push(item)
      } else {
        // Must track this here because we're directly calling _next()
        this.#ended = true
        break
      }
    }

    return acc
  }

  async all (options) {
    options = getOptions(options, emptyOptions)
    this.#startWork()

    try {
      if (this.#ended || this.#count >= this.#limit) {
        return []
      }

      const items = await this._all(options)

      try {
        this[kDecodeMany](items)
      } catch (err) {
        throw new IteratorDecodeError(err)
      }

      this.#count += items.length
      return items
    } catch (err) {
      this.#endWork()
      await this.#destroy(err)
    } finally {
      this.#ended = true

      if (this.#working) {
        this.#endWork()
        await this.close()
      }
    }
  }

  async _all (options) {
    // Must count here because we're directly calling _nextv()
    let count = this.#count

    const acc = []

    while (true) {
      // Not configurable, because implementations should optimize _all().
      const size = this.#limit < Infinity ? Math.min(1e3, this.#limit - count) : 1e3

      if (size <= 0) {
        return acc
      }

      const items = await this._nextv(size, options)

      if (items.length === 0) {
        return acc
      }

      acc.push.apply(acc, items)
      count += items.length
    }
  }

  seek (target, options) {
    options = getOptions(options, emptyOptions)

    if (this.#closingPromise !== null) {
      // Don't throw here, to be kind to implementations that wrap
      // another db and don't necessarily control when the db is closed
    } else if (this.#working) {
      throw new ModuleError('Iterator is busy: cannot call seek() until next() has completed', {
        code: 'LEVEL_ITERATOR_BUSY'
      })
    } else {
      const keyEncoding = this.db.keyEncoding(options.keyEncoding || this[kKeyEncoding])
      const keyFormat = keyEncoding.format

      if (options.keyEncoding !== keyFormat) {
        options = { ...options, keyEncoding: keyFormat }
      }

      const mapped = this.db.prefixKey(keyEncoding.encode(target), keyFormat, false)
      this._seek(mapped, options)

      // If _seek() was successfull, more data may be available.
      this.#ended = false
    }
  }

  _seek (target, options) {
    throw new ModuleError('Iterator does not implement seek()', {
      code: 'LEVEL_NOT_SUPPORTED'
    })
  }

  async close () {
    if (this.#closingPromise !== null) {
      // First caller of close() is responsible for error
      return this.#closingPromise.catch(noop)
    }

    // Wrap to avoid race issues on recursive calls
    this.#closingPromise = new Promise((resolve, reject) => {
      this.#pendingClose = () => {
        this.#pendingClose = null
        this.#privateClose().then(resolve, reject)
      }
    })

    // If working we'll delay closing, but still handle the close error (if any) here
    if (!this.#working) {
      this.#pendingClose()
    }

    return this.#closingPromise
  }

  async _close () {}

  async * [Symbol.asyncIterator] () {
    try {
      let item

      while ((item = (await this.next())) !== undefined) {
        yield item
      }
    } catch (err) {
      await this.#destroy(err)
    } finally {
      await this.close()
    }
  }

  #startWork () {
    if (this.#closingPromise !== null) {
      throw new ModuleError('Iterator is not open: cannot read after close()', {
        code: 'LEVEL_ITERATOR_NOT_OPEN'
      })
    } else if (this.#working) {
      throw new ModuleError('Iterator is busy: cannot read until previous read has completed', {
        code: 'LEVEL_ITERATOR_BUSY'
      })
    } else if (this.#signal?.aborted) {
      throw new AbortError()
    }

    // Keep snapshot open during operation
    this.#snapshot?.ref()
    this.#working = true
  }

  #endWork () {
    this.#working = false
    this.#pendingClose?.()
    this.#snapshot?.unref()
  }

  async #privateClose () {
    await this._close()
    this.db.detachResource(this)
  }

  async #destroy (err) {
    try {
      await this.close()
    } catch (closeErr) {
      throw combineErrors([err, closeErr])
    }

    throw err
  }
}

if (typeof Symbol.asyncDispose === 'symbol') {
  CommonIterator.prototype[Symbol.asyncDispose] = async function () {
    return this.close()
  }
}

// For backwards compatibility this class is not (yet) called AbstractEntryIterator.
class AbstractIterator extends CommonIterator {
  #keys
  #values

  constructor (db, options) {
    super(db, options)
    this.#keys = options.keys !== false
    this.#values = options.values !== false
  }

  [kDecodeOne] (entry) {
    const key = entry[0]
    const value = entry[1]

    if (key !== undefined) {
      entry[0] = this.#keys ? this[kKeyEncoding].decode(key) : undefined
    }

    if (value !== undefined) {
      entry[1] = this.#values ? this[kValueEncoding].decode(value) : undefined
    }

    return entry
  }

  [kDecodeMany] (entries) {
    const keyEncoding = this[kKeyEncoding]
    const valueEncoding = this[kValueEncoding]

    for (const entry of entries) {
      const key = entry[0]
      const value = entry[1]

      if (key !== undefined) entry[0] = this.#keys ? keyEncoding.decode(key) : undefined
      if (value !== undefined) entry[1] = this.#values ? valueEncoding.decode(value) : undefined
    }
  }
}

class AbstractKeyIterator extends CommonIterator {
  [kDecodeOne] (key) {
    return this[kKeyEncoding].decode(key)
  }

  [kDecodeMany] (keys) {
    const keyEncoding = this[kKeyEncoding]

    for (let i = 0; i < keys.length; i++) {
      const key = keys[i]
      if (key !== undefined) keys[i] = keyEncoding.decode(key)
    }
  }
}

class AbstractValueIterator extends CommonIterator {
  [kDecodeOne] (value) {
    return this[kValueEncoding].decode(value)
  }

  [kDecodeMany] (values) {
    const valueEncoding = this[kValueEncoding]

    for (let i = 0; i < values.length; i++) {
      const value = values[i]
      if (value !== undefined) values[i] = valueEncoding.decode(value)
    }
  }
}

// Internal utility, not typed or exported
class IteratorDecodeError extends ModuleError {
  constructor (cause) {
    super('Iterator could not decode data', {
      code: 'LEVEL_DECODE_ERROR',
      cause
    })
  }
}

// Exposed so that AbstractLevel can set these options
AbstractIterator.keyEncoding = kKeyEncoding
AbstractIterator.valueEncoding = kValueEncoding

exports.AbstractIterator = AbstractIterator
exports.AbstractKeyIterator = AbstractKeyIterator
exports.AbstractValueIterator = AbstractValueIterator
