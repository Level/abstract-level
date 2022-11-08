'use strict'

const ModuleError = require('module-error')
const combineErrors = require('maybe-combine-errors')
const { getOptions, emptyOptions, noop } = require('./lib/common')
const { AbortController } = require('./lib/abort')

const kWorking = Symbol('working')
const kDecodeOne = Symbol('decodeOne')
const kDecodeMany = Symbol('decodeMany')
const kAbortController = Symbol('abortController')
const kAbortSignalOptions = Symbol('abortSignalOptions')
const kClosing = Symbol('closing')
const kCallClose = Symbol('callClose')
const kPendingClose = Symbol('pendingClose')
const kClosingPromise = Symbol('closingPromise')
const kClosed = Symbol('closed')
const kKeyEncoding = Symbol('keyEncoding')
const kValueEncoding = Symbol('valueEncoding')
const kKeys = Symbol('keys')
const kValues = Symbol('values')
const kLimit = Symbol('limit')
const kCount = Symbol('count')

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

    this[kClosed] = false
    this[kWorking] = false
    this[kClosing] = false
    this[kPendingClose] = null
    this[kClosingPromise] = null
    this[kKeyEncoding] = options[kKeyEncoding]
    this[kValueEncoding] = options[kValueEncoding]
    this[kLimit] = Number.isInteger(options.limit) && options.limit >= 0 ? options.limit : Infinity
    this[kCount] = 0

    // TODO (signals): docs, types, tests
    this[kAbortController] = new AbortController()
    this[kAbortSignalOptions] = Object.freeze({
      signal: this[kAbortController].signal
    })

    if (options.signal) {
      // TODO (signals): combine signals
    }

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
    assertStatus(this)
    this[kWorking] = true

    try {
      if (this[kCount] >= this[kLimit]) {
        return undefined
      }

      let item = await this._next(this[kAbortSignalOptions])

      try {
        if (item !== undefined) {
          item = this[kDecodeOne](item)
          this[kCount]++
        }
      } catch (err) {
        throw new IteratorDecodeError(err)
      }

      return item
    } finally {
      this[kWorking] = false

      if (this[kPendingClose] !== null) {
        this[kPendingClose]()
      }
    }
  }

  // TODO (signals): docs
  // TODO (signals): check if signal option can work in many-level
  async _next (options) {}

  async nextv (size, options) {
    if (!Number.isInteger(size)) {
      throw new TypeError("The first argument 'size' must be an integer")
    }

    options = getAbortOptions(this, options)
    assertStatus(this)

    if (size < 1) size = 1
    if (this[kLimit] < Infinity) size = Math.min(size, this[kLimit] - this[kCount])

    this[kWorking] = true

    try {
      if (size <= 0) return []

      const items = await this._nextv(size, options)

      try {
        this[kDecodeMany](items)
      } catch (err) {
        throw new IteratorDecodeError(err)
      }

      this[kCount] += items.length
      return items
    } finally {
      this[kWorking] = false

      if (this[kPendingClose] !== null) {
        this[kPendingClose]()
      }
    }
  }

  async _nextv (size, options) {
    const acc = []

    let item

    while (acc.length < size && (item = await this._next(options)) !== undefined) {
      acc.push(item)

      // TODO (signals)
      // if (options.signal.aborted) {
      //   throw new AbortedError()
      // }
    }

    return acc
  }

  async all (options) {
    options = getAbortOptions(this, options)
    assertStatus(this)

    this[kWorking] = true

    try {
      if (this[kCount] >= this[kLimit]) {
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
      this[kWorking] = false

      if (this[kPendingClose] !== null) {
        this[kPendingClose]()
      }

      try {
        await this.close()
      } catch (closeErr) {
        throw combineErrors([err, closeErr])
      }

      throw err
    } finally {
      if (this[kWorking]) {
        this[kWorking] = false

        if (this[kPendingClose] !== null) {
          this[kPendingClose]()
        }

        await this.close()
      }
    }
  }

  async _all (options) {
    // Must count here because we're directly calling _nextv()
    // TODO: should we not increment this[kCount] as well?
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

      // TODO (signals)
      // if (options.signal.aborted) {
      //   throw new AbortedError()
      // }
    }
  }

  seek (target, options) {
    options = getOptions(options, emptyOptions)

    if (this[kClosing]) {
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
    }
  }

  _seek (target, options) {
    throw new ModuleError('Iterator does not support seek()', {
      code: 'LEVEL_NOT_SUPPORTED'
    })
  }

  async close () {
    if (this[kClosed]) {
      return
    }

    if (this[kClosing]) {
      // First caller of close() is responsible for error
      return this[kClosingPromise].catch(noop)
    } else {
      this[kClosing] = true

      if (this[kWorking]) {
        // Wait for work, but handle closing and its error here.
        this[kClosingPromise] = new Promise((resolve, reject) => {
          this[kPendingClose] = () => {
            this[kCallClose]().then(resolve, reject)
          }
        })

        // If implementation supports it, abort the work.
        this[kAbortController].abort()
      } else {
        this[kClosingPromise] = this[kCallClose]()
      }

      return this[kClosingPromise]
    }
  }

  async _close () {}

  async [kCallClose] () {
    this[kPendingClose] = null

    try {
      await this._close()
    } finally {
      this[kClosed] = true
    }

    this.db.detachResource(this)
  }

  async * [Symbol.asyncIterator] () {
    try {
      let item

      while ((item = (await this.next())) !== undefined) {
        yield item
      }
    } finally {
      if (!this[kClosed]) await this.close()
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

// Internal utility, not typed or exported
// TODO (signals): define and document new code
// class AbortedError extends ModuleError {
//   constructor (cause) {
//     super('Iterator has been aborted', {
//       code: 'LEVEL_ITERATOR_NOT_OPEN',
//       cause
//     })
//   }
// }

// To help migrating to abstract-level
for (const k of ['_ended property', '_nexting property', '_end method']) {
  Object.defineProperty(AbstractIterator.prototype, k.split(' ')[0], {
    get () { throw new ModuleError(`The ${k} has been removed`, { code: 'LEVEL_LEGACY' }) },
    set () { throw new ModuleError(`The ${k} has been removed`, { code: 'LEVEL_LEGACY' }) }
  })
}

function assertStatus (iterator) {
  if (iterator[kClosing]) {
    throw new ModuleError('Iterator is not open: cannot read after close()', {
      code: 'LEVEL_ITERATOR_NOT_OPEN'
    })
  } else if (iterator[kWorking]) {
    throw new ModuleError('Iterator is busy: cannot read until previous read has completed', {
      code: 'LEVEL_ITERATOR_BUSY'
    })
  }

  // TODO (signals): may want to do (unless aborting closes the iterator, TBD):
  // if (iterator[kAbortController].signal.aborted) {
  //   throw new AbortedError()
  // }
}

function getAbortOptions (iterator, options) {
  if (typeof options === 'object' && options !== null) {
    // The signal option should only be set via constructor. Including when we're
    // forwarding calls like in AbstractSublevelIterator#_next(). Meaning we knowingly
    // lose the signal between _next({ signal }) and next({ signal }) calls. We might
    // support merging signals in the future but at this time we don't need it, because
    // in these forwarding scenarios, we also forward close() and thus the main signal.
    return Object.assign({}, options, iterator[kAbortSignalOptions])
  } else {
    // Avoid an expensive Object.assign({})
    return iterator[kAbortSignalOptions]
  }
}

// Exposed so that AbstractLevel can set these options
AbstractIterator.keyEncoding = kKeyEncoding
AbstractIterator.valueEncoding = kValueEncoding

exports.AbstractIterator = AbstractIterator
exports.AbstractKeyIterator = AbstractKeyIterator
exports.AbstractValueIterator = AbstractValueIterator
