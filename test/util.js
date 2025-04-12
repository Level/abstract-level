'use strict'

const { AbstractLevel, AbstractChainedBatch, AbstractSnapshot } = require('..')
const { AbstractIterator, AbstractKeyIterator, AbstractValueIterator } = require('..')
const noop = function () {}

exports.illegalKeys = [
  { name: 'null key', key: null },
  { name: 'undefined key', key: undefined }
]

exports.illegalValues = [
  { name: 'null key', value: null },
  { name: 'undefined value', value: undefined }
]

// Utility to ensure we're not fooled by `await 123`. Instead do `await assertPromise(123)`
exports.assertPromise = function (p) {
  if (typeof p !== 'object' || p === null || typeof p.then !== 'function') {
    throw new TypeError('Expected a promise')
  }

  return p
}

exports.mockLevel = function (methods, ...args) {
  class TestLevel extends AbstractLevel {}
  for (const k in methods) TestLevel.prototype[k] = methods[k]
  if (!args.length) args = [{ encodings: { utf8: true } }]
  return new TestLevel(...args)
}

exports.mockIterator = function (db, options, methods, ...args) {
  class TestIterator extends AbstractIterator {}
  for (const k in methods) TestIterator.prototype[k] = methods[k]
  return new TestIterator(db, options, ...args)
}

exports.mockChainedBatch = function (db, methods, ...args) {
  class TestBatch extends AbstractChainedBatch {}
  for (const k in methods) TestBatch.prototype[k] = methods[k]
  return new TestBatch(db, ...args)
}

// Mock encoding where null and undefined are significant types
exports.nullishEncoding = {
  name: 'nullish',
  format: 'utf8',
  encode (v) {
    return v === null ? '\x00' : v === undefined ? '\xff' : String(v)
  },
  decode (v) {
    return v === '\x00' ? null : v === '\xff' ? undefined : v
  }
}

// Replacement for sinon package (which breaks too often, on features we don't use)
exports.createSpy = function (fn = noop) {
  let calls = []

  const spy = function (...args) {
    const returnValue = fn(...args)
    calls.push({ thisValue: this, args, returnValue })
    spy.callCount++
    return returnValue
  }

  spy.callCount = 0
  spy.getCall = function (n) {
    return calls[n]
  }

  spy.resetHistory = function () {
    calls = []
    spy.callCount = 0
  }

  return spy
}

const kEntries = Symbol('entries')
const kPosition = Symbol('position')
const kOptions = Symbol('options')

/**
 * A minimal and non-optimized implementation for use in tests. Only supports utf8.
 * Don't use this as a reference implementation.
 */
class MinimalLevel extends AbstractLevel {
  constructor (options) {
    super({
      encodings: { utf8: true },
      seek: true,
      has: true,
      explicitSnapshots: true,
      getSync: true
    }, options)

    this[kEntries] = new Map()
  }

  async _put (key, value, options) {
    this[kEntries].set(key, value)
  }

  async _get (key, options) {
    const entries = (options.snapshot || this)[kEntries]

    // Is undefined if not found
    return entries.get(key)
  }

  _getSync (key, options) {
    const entries = (options.snapshot || this)[kEntries]
    return entries.get(key)
  }

  async _getMany (keys, options) {
    const entries = (options.snapshot || this)[kEntries]
    return keys.map(k => entries.get(k))
  }

  async _has (key, options) {
    const entries = (options.snapshot || this)[kEntries]
    return entries.has(key)
  }

  async _hasMany (keys, options) {
    const entries = (options.snapshot || this)[kEntries]
    return keys.map(k => entries.has(k))
  }

  async _del (key, options) {
    this[kEntries].delete(key)
  }

  async _clear (options) {
    const entries = (options.snapshot || this)[kEntries]

    for (const [k] of sliceEntries(entries, options, true)) {
      this[kEntries].delete(k)
    }
  }

  async _batch (operations, options) {
    const entries = new Map(this[kEntries])

    for (const op of operations) {
      if (op.type === 'put') entries.set(op.key, op.value)
      else entries.delete(op.key)
    }

    this[kEntries] = entries
  }

  _iterator (options) {
    return new MinimalIterator(this, options)
  }

  _keys (options) {
    return new MinimalKeyIterator(this, options)
  }

  _values (options) {
    return new MinimalValueIterator(this, options)
  }

  _snapshot (options) {
    return new MinimalSnapshot(this, options)
  }
}

class MinimalSnapshot extends AbstractSnapshot {
  constructor (db, options) {
    super(options)
    this[kEntries] = new Map(db[kEntries])
  }
}

class MinimalIterator extends AbstractIterator {
  constructor (db, options) {
    super(db, options)
    const entries = (options.snapshot || db)[kEntries]
    this[kEntries] = sliceEntries(entries, options, false)
    this[kOptions] = options
    this[kPosition] = 0
  }
}

class MinimalKeyIterator extends AbstractKeyIterator {
  constructor (db, options) {
    super(db, options)
    const entries = (options.snapshot || db)[kEntries]
    this[kEntries] = sliceEntries(entries, options, false)
    this[kOptions] = options
    this[kPosition] = 0
  }
}

class MinimalValueIterator extends AbstractValueIterator {
  constructor (db, options) {
    super(db, options)
    const entries = (options.snapshot || db)[kEntries]
    this[kEntries] = sliceEntries(entries, options, false)
    this[kOptions] = options
    this[kPosition] = 0
  }
}

for (const Ctor of [MinimalIterator, MinimalKeyIterator, MinimalValueIterator]) {
  const mapEntry = Ctor === MinimalIterator ? e => e.slice() : Ctor === MinimalKeyIterator ? e => e[0] : e => e[1]

  Ctor.prototype._next = async function () {
    const entry = this[kEntries][this[kPosition]++]
    if (entry === undefined) return undefined
    return mapEntry(entry)
  }

  Ctor.prototype._nextv = async function (size, options) {
    const entries = this[kEntries].slice(this[kPosition], this[kPosition] + size)
    this[kPosition] += entries.length
    return entries.map(mapEntry)
  }

  Ctor.prototype._all = async function (options) {
    const end = this.limit - this.count + this[kPosition]
    const entries = this[kEntries].slice(this[kPosition], end)
    this[kPosition] = this[kEntries].length
    return entries.map(mapEntry)
  }

  Ctor.prototype._seek = function (target, options) {
    this[kPosition] = this[kEntries].length

    if (!outOfRange(target, this[kOptions])) {
      // Don't care about performance here
      for (let i = 0; i < this[kPosition]; i++) {
        const key = this[kEntries][i][0]

        if (this[kOptions].reverse ? key <= target : key >= target) {
          this[kPosition] = i
        }
      }
    }
  }
}

const outOfRange = function (target, options) {
  if ('gte' in options) {
    if (target < options.gte) return true
  } else if ('gt' in options) {
    if (target <= options.gt) return true
  }

  if ('lte' in options) {
    if (target > options.lte) return true
  } else if ('lt' in options) {
    if (target >= options.lt) return true
  }

  return false
}

const sliceEntries = function (entries, options, applyLimit) {
  entries = Array.from(entries)
    .filter((e) => !outOfRange(e[0], options))
    .sort((a, b) => a[0] > b[0] ? 1 : a[0] < b[0] ? -1 : 0)

  if (options.reverse) entries.reverse()
  if (applyLimit && options.limit !== -1) entries = entries.slice(0, options.limit)

  return entries
}

exports.MinimalLevel = MinimalLevel
