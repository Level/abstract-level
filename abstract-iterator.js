'use strict'

const ModuleError = require('module-error')
const combineErrors = require('maybe-combine-errors')
const { getOptions, emptyOptions, noop } = require('./lib/common')
const { AbortError } = require('./lib/errors')

const kWorking = Symbol('working')
const kDecodeOne = Symbol('decodeOne')
const kDecodeMany = Symbol('decodeMany')
const kSignal = Symbol('signal')
const kPendingClose = Symbol('pendingClose')
const kClosingPromise = Symbol('closingPromise')
const kKeyEncoding = Symbol('keyEncoding')
const kValueEncoding = Symbol('valueEncoding')
const kKeys = Symbol('keys')
const kValues = Symbol('values')
const kLimit = Symbol('limit')
const kCount = Symbol('count')
const kEnded = Symbol('ended')

// This class is an internal utility for common functionality between AbstractIterator,
// AbstractKeyIterator and AbstractValueIterator. It's not exported.
class CommonIterator {
  constructor (db, options) {
    if (typeof db !== 'object' || db === null) {
      const hint = db === null ? 'null' : typeof db
      throw new TypeError(`The first argument must be an abstract-level database, received ${hint}`)
    }

    if (typeof options !== 'object' || options === null) {
      throw new TypeError('The second argument must be an options object')
    }

    this[kWorking] = false
    this[kPendingClose] = null
    this[kClosingPromise] = null
    this[kKeyEncoding] = options[kKeyEncoding]
    this[kValueEncoding] = options[kValueEncoding]
    this[kLimit] = Number.isInteger(options.limit) && options.limit >= 0 ? options.limit : Infinity
    this[kCount] = 0
    this[kSignal] = options.signal != null ? options.signal : null

    // Ending means reaching the natural end of the data and (unlike closing) that can
    // be reset by seek(), unless the limit was reached.
    this[kEnded] = false

    this.db = db
    this.db.attachResource(this)
  }

  get count () {
    return this[kCount]
  }

  get limit () {
    return this[kLimit]
  }

  async next () {
    startWork(this)

    try {
      if (this[kEnded] || this[kCount] >= this[kLimit]) {
        this[kEnded] = true
        return undefined
      }

      let item = await this._next()

      if (item === undefined) {
        this[kEnded] = true
        return undefined
      }

      try {
        item = this[kDecodeOne](item)
      } catch (err) {
        throw new IteratorDecodeError(err)
      }

      this[kCount]++
      return item
    } finally {
      endWork(this)
    }
  }

  async _next () {}

  async nextv (size, options) {
    if (!Number.isInteger(size)) {
      throw new TypeError("The first argument 'size' must be an integer")
    }

    options = getOptions(options, emptyOptions)

    if (size < 1) size = 1
    if (this[kLimit] < Infinity) size = Math.min(size, this[kLimit] - this[kCount])

    startWork(this)

    try {
      if (this[kEnded] || size <= 0) {
        this[kEnded] = true
        return []
      }

      const items = await this._nextv(size, options)

      if (items.length === 0) {
        this[kEnded] = true
        return items
      }

      try {
        this[kDecodeMany](items)
      } catch (err) {
        throw new IteratorDecodeError(err)
      }

      this[kCount] += items.length
      return items
    } finally {
      endWork(this)
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
        this[kEnded] = true
        break
      }
    }

    return acc
  }

  async all (options) {
    options = getOptions(options, emptyOptions)
    startWork(this)

    try {
      if (this[kEnded] || this[kCount] >= this[kLimit]) {
        return []
      }

      const items = await this._all(options)

      try {
        this[kDecodeMany](items)
      } catch (err) {
        throw new IteratorDecodeError(err)
      }

      this[kCount] += items.length
      return items
    } catch (err) {
      endWork(this)
      await destroy(this, err)
    } finally {
      this[kEnded] = true

      if (this[kWorking]) {
        endWork(this)
        await this.close()
      }
    }
  }

  async _all (options) {
    // Must count here because we're directly calling _nextv()
    let count = this[kCount]

    const acc = []

    while (true) {
      // Not configurable, because implementations should optimize _all().
      const size = this[kLimit] < Infinity ? Math.min(1e3, this[kLimit] - count) : 1e3

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

    if (this[kClosingPromise] !== null) {
      // Don't throw here, to be kind to implementations that wrap
      // another db and don't necessarily control when the db is closed
    } else if (this[kWorking]) {
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
      this[kEnded] = false
    }
  }

  _seek (target, options) {
    throw new ModuleError('Iterator does not support seek()', {
      code: 'LEVEL_NOT_SUPPORTED'
    })
  }

  async close () {
    if (this[kClosingPromise] !== null) {
      // First caller of close() is responsible for error
      return this[kClosingPromise].catch(noop)
    }

    // Wrap to avoid race issues on recursive calls
    this[kClosingPromise] = new Promise((resolve, reject) => {
      this[kPendingClose] = () => {
        this[kPendingClose] = null
        privateClose(this).then(resolve, reject)
      }
    })

    // If working we'll delay closing, but still handle the close error (if any) here
    if (!this[kWorking]) {
      this[kPendingClose]()
    }

    return this[kClosingPromise]
  }

  async _close () {}

  async * [Symbol.asyncIterator] () {
    try {
      let item

      while ((item = (await this.next())) !== undefined) {
        yield item
      }
    } catch (err) {
      await destroy(this, err)
    } finally {
      await this.close()
    }
  }
}

// For backwards compatibility this class is not (yet) called AbstractEntryIterator.
class AbstractIterator extends CommonIterator {
  constructor (db, options) {
    super(db, options)
    this[kKeys] = options.keys !== false
    this[kValues] = options.values !== false
  }

  [kDecodeOne] (entry) {
    const key = entry[0]
    const value = entry[1]

    if (key !== undefined) {
      entry[0] = this[kKeys] ? this[kKeyEncoding].decode(key) : undefined
    }

    if (value !== undefined) {
      entry[1] = this[kValues] ? this[kValueEncoding].decode(value) : undefined
    }

    return entry
  }

  [kDecodeMany] (entries) {
    const keyEncoding = this[kKeyEncoding]
    const valueEncoding = this[kValueEncoding]

    for (const entry of entries) {
      const key = entry[0]
      const value = entry[1]

      if (key !== undefined) entry[0] = this[kKeys] ? keyEncoding.decode(key) : undefined
      if (value !== undefined) entry[1] = this[kValues] ? valueEncoding.decode(value) : undefined
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

const startWork = function (iterator) {
  if (iterator[kClosingPromise] !== null) {
    throw new ModuleError('Iterator is not open: cannot read after close()', {
      code: 'LEVEL_ITERATOR_NOT_OPEN'
    })
  } else if (iterator[kWorking]) {
    throw new ModuleError('Iterator is busy: cannot read until previous read has completed', {
      code: 'LEVEL_ITERATOR_BUSY'
    })
  } else if (iterator[kSignal] !== null && iterator[kSignal].aborted) {
    throw new AbortError()
  }

  iterator[kWorking] = true
}

const endWork = function (iterator) {
  iterator[kWorking] = false

  if (iterator[kPendingClose] !== null) {
    iterator[kPendingClose]()
  }
}

const privateClose = async function (iterator) {
  await iterator._close()
  iterator.db.detachResource(iterator)
}

const destroy = async function (iterator, err) {
  try {
    await iterator.close()
  } catch (closeErr) {
    throw combineErrors([err, closeErr])
  }

  throw err
}

// Exposed so that AbstractLevel can set these options
AbstractIterator.keyEncoding = kKeyEncoding
AbstractIterator.valueEncoding = kValueEncoding

exports.AbstractIterator = AbstractIterator
exports.AbstractKeyIterator = AbstractKeyIterator
exports.AbstractValueIterator = AbstractValueIterator
