'use strict'

const ModuleError = require('module-error')
const { Buffer } = require('buffer') || {}
const {
  AbstractSublevelIterator,
  AbstractSublevelKeyIterator,
  AbstractSublevelValueIterator
} = require('./abstract-sublevel-iterator')

const kGlobalPrefix = Symbol('prefix')
const kLocalPrefix = Symbol('localPrefix')
const kLocalPath = Symbol('localPath')
const kGlobalPath = Symbol('globalPath')
const kGlobalUpperBound = Symbol('upperBound')
const kPrefixRange = Symbol('prefixRange')
const kRoot = Symbol('root')
const kParent = Symbol('parent')
const kUnfix = Symbol('unfix')

const textEncoder = new TextEncoder()
const defaults = { separator: '!' }

// Wrapped to avoid circular dependency
module.exports = function ({ AbstractLevel }) {
  class AbstractSublevel extends AbstractLevel {
    static defaults (options) {
      if (options == null) {
        return defaults
      } else if (!options.separator) {
        return { ...options, separator: '!' }
      } else {
        return options
      }
    }

    // TODO: add autoClose option, which if true, does parent.attachResource(this)
    constructor (db, name, options) {
      // Don't forward AbstractSublevel options to AbstractLevel
      const { separator, manifest, ...forward } = AbstractSublevel.defaults(options)
      const names = [].concat(name).map(name => trim(name, separator))

      // Reserve one character between separator and name to give us an upper bound
      const reserved = separator.charCodeAt(0) + 1
      const root = db[kRoot] || db

      // Keys should sort like ['!a!', '!a!!a!', '!a"', '!aa!', '!b!'].
      // Use ASCII for consistent length between string, Buffer and Uint8Array
      if (!names.every(name => textEncoder.encode(name).every(x => x > reserved && x < 127))) {
        throw new ModuleError(`Sublevel name must use bytes > ${reserved} < ${127}`, {
          code: 'LEVEL_INVALID_PREFIX'
        })
      }

      super(mergeManifests(db, manifest), forward)

      const localPrefix = names.map(name => separator + name + separator).join('')
      const globalPrefix = (db.prefix || '') + localPrefix
      const globalUpperBound = globalPrefix.slice(0, -1) + String.fromCharCode(reserved)

      // Most operations are forwarded to the parent database, but clear() and iterators
      // still forward to the root database - which is older logic and does not yet need
      // to change, until we add some form of preread or postread hooks.
      this[kRoot] = root
      this[kParent] = db
      this[kLocalPath] = names
      this[kGlobalPath] = db.prefix ? db.path().concat(names) : names
      this[kGlobalPrefix] = new MultiFormat(globalPrefix)
      this[kGlobalUpperBound] = new MultiFormat(globalUpperBound)
      this[kLocalPrefix] = new MultiFormat(localPrefix)
      this[kUnfix] = new Unfixer()
    }

    prefixKey (key, keyFormat, local) {
      const prefix = local ? this[kLocalPrefix] : this[kGlobalPrefix]

      if (keyFormat === 'utf8') {
        return prefix.utf8 + key
      } else if (key.byteLength === 0) {
        // Fast path for empty key (no copy)
        return prefix[keyFormat]
      } else if (keyFormat === 'view') {
        const view = prefix.view
        const result = new Uint8Array(view.byteLength + key.byteLength)

        result.set(view, 0)
        result.set(key, view.byteLength)

        return result
      } else {
        const buffer = prefix.buffer
        return Buffer.concat([buffer, key], buffer.byteLength + key.byteLength)
      }
    }

    // Not exposed for now.
    [kPrefixRange] (range, keyFormat) {
      if (range.gte !== undefined) {
        range.gte = this.prefixKey(range.gte, keyFormat, false)
      } else if (range.gt !== undefined) {
        range.gt = this.prefixKey(range.gt, keyFormat, false)
      } else {
        range.gte = this[kGlobalPrefix][keyFormat]
      }

      if (range.lte !== undefined) {
        range.lte = this.prefixKey(range.lte, keyFormat, false)
      } else if (range.lt !== undefined) {
        range.lt = this.prefixKey(range.lt, keyFormat, false)
      } else {
        range.lte = this[kGlobalUpperBound][keyFormat]
      }
    }

    get prefix () {
      return this[kGlobalPrefix].utf8
    }

    get db () {
      return this[kRoot]
    }

    get parent () {
      return this[kParent]
    }

    path (local = false) {
      return local ? this[kLocalPath] : this[kGlobalPath]
    }

    async _open (options) {
      // The parent db must open itself or be (re)opened by the user because
      // a sublevel should not initiate state changes on the rest of the db.
      return this[kParent].open({ passive: true })
    }

    async _put (key, value, options) {
      return this[kParent].put(key, value, options)
    }

    async _get (key, options) {
      return this[kParent].get(key, options)
    }

    async _getMany (keys, options) {
      return this[kParent].getMany(keys, options)
    }

    async _del (key, options) {
      return this[kParent].del(key, options)
    }

    async _batch (operations, options) {
      return this[kParent].batch(operations, options)
    }

    // TODO: call parent instead of root
    async _clear (options) {
      // TODO (refactor): move to AbstractLevel
      this[kPrefixRange](options, options.keyEncoding)
      return this[kRoot].clear(options)
    }

    // TODO: call parent instead of root
    _iterator (options) {
      // TODO (refactor): move to AbstractLevel
      this[kPrefixRange](options, options.keyEncoding)
      const iterator = this[kRoot].iterator(options)
      const unfix = this[kUnfix].get(this[kGlobalPrefix].utf8.length, options.keyEncoding)
      return new AbstractSublevelIterator(this, options, iterator, unfix)
    }

    _keys (options) {
      this[kPrefixRange](options, options.keyEncoding)
      const iterator = this[kRoot].keys(options)
      const unfix = this[kUnfix].get(this[kGlobalPrefix].utf8.length, options.keyEncoding)
      return new AbstractSublevelKeyIterator(this, options, iterator, unfix)
    }

    _values (options) {
      this[kPrefixRange](options, options.keyEncoding)
      const iterator = this[kRoot].values(options)
      return new AbstractSublevelValueIterator(this, options, iterator)
    }
  }

  return { AbstractSublevel }
}

const mergeManifests = function (parent, manifest) {
  return {
    // Inherit manifest of parent db
    ...parent.supports,

    // Disable unsupported features
    createIfMissing: false,
    errorIfExists: false,

    // Unset additional events because we're not forwarding them
    events: {},

    // Unset additional methods (like approximateSize) which we can't support here unless
    // the AbstractSublevel class is overridden by an implementation of `abstract-level`.
    additionalMethods: {},

    // Inherit manifest of custom AbstractSublevel subclass. Such a class is not
    // allowed to override encodings.
    ...manifest,

    encodings: {
      utf8: supportsEncoding(parent, 'utf8'),
      buffer: supportsEncoding(parent, 'buffer'),
      view: supportsEncoding(parent, 'view')
    }
  }
}

const supportsEncoding = function (parent, encoding) {
  // Prefer a non-transcoded encoding for optimal performance
  return parent.supports.encodings[encoding]
    ? parent.keyEncoding(encoding).name === encoding
    : false
}

class MultiFormat {
  constructor (key) {
    this.utf8 = key
    this.view = textEncoder.encode(key)
    this.buffer = Buffer ? Buffer.from(this.view.buffer, 0, this.view.byteLength) : {}
  }
}

class Unfixer {
  constructor () {
    this.cache = new Map()
  }

  get (prefixLength, keyFormat) {
    let unfix = this.cache.get(keyFormat)

    if (unfix === undefined) {
      if (keyFormat === 'view') {
        unfix = function (prefixLength, key) {
          // Avoid Uint8Array#slice() because it copies
          return key.subarray(prefixLength)
        }.bind(null, prefixLength)
      } else {
        unfix = function (prefixLength, key) {
          // Avoid Buffer#subarray() because it's slow
          return key.slice(prefixLength)
        }.bind(null, prefixLength)
      }

      this.cache.set(keyFormat, unfix)
    }

    return unfix
  }
}

const trim = function (str, char) {
  let start = 0
  let end = str.length

  while (start < end && str[start] === char) start++
  while (end > start && str[end - 1] === char) end--

  return str.slice(start, end)
}
