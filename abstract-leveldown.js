'use strict'

const supports = require('level-supports')
const Transcoder = require('level-transcoder')
const { EventEmitter } = require('events')
const { fromCallback } = require('catering')
const ModuleError = require('module-error')
const AbstractIterator = require('./abstract-iterator')
const DeferredIterator = require('./lib/deferred-iterator')
const DefaultChainedBatch = require('./lib/default-chained-batch')
const { getCallback, getOptions } = require('./lib/common')
const rangeOptions = require('./lib/range-options')

const kPromise = Symbol('promise')
const kLanded = Symbol('landed')
const kResources = Symbol('resources')
const kCloseResources = Symbol('closeResources')
const kOperations = Symbol('operations')
const kUndefer = Symbol('undefer')
const kDeferOpen = Symbol('deferOpen')
const kOptions = Symbol('options')
const kStatus = Symbol('status')
const kDefaultOptions = Symbol('defaultOptions')
const kTranscoder = Symbol('transcoder')
const kKeyEncoding = Symbol('keyEncoding')
const kValueEncoding = Symbol('valueEncoding')
const noop = () => {}

function AbstractLevelDOWN (manifest, options, _callback) {
  if (typeof manifest !== 'object' || manifest === null) {
    throw new TypeError("The first argument 'manifest' must be an object")
  }

  _callback = getCallback(options, _callback)
  options = getOptions(options)

  // To help migrating to abstract-level
  if (typeof _callback === 'function') {
    throw new ModuleError('The levelup-style callback argument has been removed', {
      code: 'LEVEL_LEGACY'
    })
  }

  EventEmitter.call(this)

  const { keyEncoding, valueEncoding, passive, ...forward } = options

  this[kResources] = new Set()
  this[kOperations] = []
  this[kDeferOpen] = true
  this[kOptions] = forward
  this[kStatus] = 'opening'

  this.supports = supports(manifest, {
    status: true,
    promises: true,
    clear: true,
    getMany: true,
    idempotentOpen: true,
    passiveOpen: true,
    deferredOpen: true,
    snapshots: manifest.snapshots !== false,
    permanence: manifest.permanence !== false,
    encodings: manifest.encodings || {},
    events: {
      ...manifest.events,
      opening: true,
      open: true,
      closing: true,
      closed: true,
      put: true,
      del: true,
      batch: true,
      clear: true
    }
  })

  // Get encodings supported by implementation
  const formats = Object.keys(this.supports.encodings)
    .filter(k => !!this.supports.encodings[k])

  this[kTranscoder] = new Transcoder(formats, options)
  this[kKeyEncoding] = this[kTranscoder].encoding(keyEncoding || 'utf8')
  this[kValueEncoding] = this[kTranscoder].encoding(valueEncoding || 'utf8')

  // Add custom and transcoder encodings to manifest
  for (const encoding of this[kTranscoder].encodings()) {
    if (!this.supports.encodings[encoding.commonName]) {
      this.supports.encodings[encoding.commonName] = true
    }
  }

  this[kDefaultOptions] = {
    empty: {},
    entry: {
      keyEncoding: this[kKeyEncoding].commonName,
      valueEncoding: this[kValueEncoding].commonName
    },
    key: {
      keyEncoding: this[kKeyEncoding].commonName
    }
  }

  // Let subclass finish its constructor
  this.nextTick(() => {
    if (this[kDeferOpen]) {
      this.open({ passive: false }, noop)
    }
  })
}

Object.setPrototypeOf(AbstractLevelDOWN.prototype, EventEmitter.prototype)

Object.defineProperty(AbstractLevelDOWN.prototype, 'status', {
  enumerable: true,
  get () {
    return this[kStatus]
  }
})

AbstractLevelDOWN.prototype.keyEncoding = function (encoding) {
  return this[kTranscoder].encoding(encoding != null ? encoding : this[kKeyEncoding])
}

AbstractLevelDOWN.prototype.valueEncoding = function (encoding) {
  return this[kTranscoder].encoding(encoding != null ? encoding : this[kValueEncoding])
}

AbstractLevelDOWN.prototype.open = function (options, callback) {
  callback = getCallback(options, callback)
  callback = fromCallback(callback, kPromise)

  options = { ...this[kOptions], ...getOptions(options) }

  options.createIfMissing = options.createIfMissing !== false
  options.errorIfExists = !!options.errorIfExists

  const maybeOpened = (err) => {
    if (this[kStatus] === 'closing' || this[kStatus] === 'opening') {
      // Wait until pending state changes are done
      this.once(kLanded, err ? () => maybeOpened(err) : maybeOpened)
    } else if (this[kStatus] !== 'open') {
      callback(new ModuleError('Database is not open', {
        code: 'LEVEL_DATABASE_NOT_OPEN',
        cause: err
      }))
    } else {
      callback()
    }
  }

  if (options.passive) {
    if (this[kStatus] === 'opening') {
      this.once(kLanded, maybeOpened)
    } else {
      this.nextTick(maybeOpened)
    }
  } else if (this[kStatus] === 'closed' || this[kDeferOpen]) {
    this[kDeferOpen] = false
    this[kStatus] = 'opening'
    this.emit('opening')

    this._open(options, (err) => {
      if (err) {
        this[kStatus] = 'closed'

        // Resources must be safe to close in any db state
        this[kCloseResources](() => {
          this.emit(kLanded)
          maybeOpened(err)
        })

        this[kUndefer]()
        return
      }

      this[kStatus] = 'open'
      this[kUndefer]()
      this.emit(kLanded)

      // Only emit public event if pending state changes are done
      if (this[kStatus] === 'open') this.emit('open')

      maybeOpened()
    })
  } else if (this[kStatus] === 'open') {
    this.nextTick(maybeOpened)
  } else {
    this.once(kLanded, () => this.open(options, callback))
  }

  return callback[kPromise]
}

AbstractLevelDOWN.prototype._open = function (options, callback) {
  this.nextTick(callback)
}

AbstractLevelDOWN.prototype.close = function (callback) {
  callback = fromCallback(callback, kPromise)

  const maybeClosed = (err) => {
    if (this[kStatus] === 'opening' || this[kStatus] === 'closing') {
      // Wait until pending state changes are done
      this.once(kLanded, err ? maybeClosed(err) : maybeClosed)
    } else if (this[kStatus] !== 'closed') {
      callback(new ModuleError('Database is not closed', {
        code: 'LEVEL_DATABASE_NOT_CLOSED',
        cause: err
      }))
    } else {
      callback()
    }
  }

  if (this[kStatus] === 'open') {
    this[kStatus] = 'closing'
    this.emit('closing')

    const cancel = (err) => {
      this[kStatus] = 'open'
      this[kUndefer]()
      this.emit(kLanded)
      maybeClosed(err)
    }

    this[kCloseResources](() => {
      this._close((err) => {
        if (err) return cancel(err)

        this[kStatus] = 'closed'
        this[kUndefer]()
        this.emit(kLanded)

        // Only emit public event if pending state changes are done
        if (this[kStatus] === 'closed') this.emit('closed')

        maybeClosed()
      })
    })
  } else if (this[kStatus] === 'closed') {
    this.nextTick(maybeClosed)
  } else {
    this.once(kLanded, () => this.close(callback))
  }

  return callback[kPromise]
}

AbstractLevelDOWN.prototype[kCloseResources] = function (callback) {
  if (this[kResources].size === 0) {
    return this.nextTick(callback)
  }

  let pending = this[kResources].size
  let sync = true

  const next = () => {
    if (--pending === 0) {
      // We don't have tests for generic resources, so dezalgo
      if (sync) this.nextTick(callback)
      else callback()
    }
  }

  // In parallel so that all resources know they are closed
  for (const resource of this[kResources]) {
    resource.close(next)
  }

  sync = false
  this[kResources].clear()
}

AbstractLevelDOWN.prototype._close = function (callback) {
  this.nextTick(callback)
}

AbstractLevelDOWN.prototype.get = function (key, options, callback) {
  callback = getCallback(options, callback)
  callback = fromCallback(callback, kPromise)
  options = getOptions(options, this[kDefaultOptions].entry)

  if (this[kStatus] === 'opening') {
    this.defer(() => this.get(key, options, callback))
    return callback[kPromise]
  }

  if (maybeError(this, callback)) {
    return callback[kPromise]
  }

  const err = this._checkKey(key)

  if (err) {
    this.nextTick(callback, err)
    return callback[kPromise]
  }

  const keyEncoding = this.keyEncoding(options.keyEncoding)
  const valueEncoding = this.valueEncoding(options.valueEncoding)

  // Forward encoding options to the underlying store
  if (options.keyEncoding !== keyEncoding.format ||
    options.valueEncoding !== valueEncoding.format) {
    options = {
      ...options,
      keyEncoding: keyEncoding.format,
      valueEncoding: valueEncoding.format
    }
  }

  this._get(keyEncoding.encode(key), options, (err, value) => {
    if (err) {
      // Normalize not found error for backwards compatibility with abstract-leveldown and level(up)
      if (err.code === 'LEVEL_NOT_FOUND' || err.notFound || /NotFound/i.test(err)) {
        if (!err.code) err.code = 'LEVEL_NOT_FOUND' // Preferred way going forward
        if (!err.notFound) err.notFound = true // Same as level-errors
        if (!err.status) err.status = 404 // Same as level-errors
      }

      return callback(err)
    }

    try {
      value = valueEncoding.decode(value)
    } catch (err) {
      return callback(new ModuleError('Could not decode value', {
        code: 'LEVEL_DECODE_ERROR',
        cause: err
      }))
    }

    callback(null, value)
  })

  return callback[kPromise]
}

AbstractLevelDOWN.prototype._get = function (key, options, callback) {
  this.nextTick(callback, new Error('NotFound'))
}

AbstractLevelDOWN.prototype.getMany = function (keys, options, callback) {
  callback = getCallback(options, callback)
  callback = fromCallback(callback, kPromise)
  options = getOptions(options, this[kDefaultOptions].entry)

  if (this[kStatus] === 'opening') {
    this.defer(() => this.getMany(keys, options, callback))
    return callback[kPromise]
  }

  if (maybeError(this, callback)) {
    return callback[kPromise]
  }

  if (!Array.isArray(keys)) {
    this.nextTick(callback, new TypeError("The first argument 'keys' must be an array"))
    return callback[kPromise]
  }

  if (keys.length === 0) {
    this.nextTick(callback, null, [])
    return callback[kPromise]
  }

  const keyEncoding = this.keyEncoding(options.keyEncoding)
  const valueEncoding = this.valueEncoding(options.valueEncoding)

  // Forward encoding options
  if (options.keyEncoding !== keyEncoding.format ||
    options.valueEncoding !== valueEncoding.format) {
    options = {
      ...options,
      keyEncoding: keyEncoding.format,
      valueEncoding: valueEncoding.format
    }
  }

  const encoded = new Array(keys.length)

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i]
    const err = this._checkKey(key)

    if (err) {
      this.nextTick(callback, err)
      return callback[kPromise]
    }

    encoded[i] = keyEncoding.encode(key)
  }

  this._getMany(encoded, options, (err, values) => {
    if (err) return callback(err)

    try {
      for (let i = 0; i < values.length; i++) {
        if (values[i] !== undefined) {
          values[i] = valueEncoding.decode(values[i])
        }
      }
    } catch (err) {
      return callback(new ModuleError(`Could not decode one or more of ${values.length} value(s)`, {
        code: 'LEVEL_DECODE_ERROR',
        cause: err
      }))
    }

    callback(null, values)
  })

  return callback[kPromise]
}

AbstractLevelDOWN.prototype._getMany = function (keys, options, callback) {
  this.nextTick(callback, null, new Array(keys.length).fill(undefined))
}

AbstractLevelDOWN.prototype.put = function (key, value, options, callback) {
  callback = getCallback(options, callback)
  callback = fromCallback(callback, kPromise)
  options = getOptions(options, this[kDefaultOptions].entry)

  if (this[kStatus] === 'opening') {
    this.defer(() => this.put(key, value, options, callback))
    return callback[kPromise]
  }

  if (maybeError(this, callback)) {
    return callback[kPromise]
  }

  const err = this._checkKey(key) || this._checkValue(value)

  if (err) {
    this.nextTick(callback, err)
    return callback[kPromise]
  }

  const keyEncoding = this.keyEncoding(options.keyEncoding)
  const valueEncoding = this.valueEncoding(options.valueEncoding)

  // Forward encoding options
  if (options.keyEncoding !== keyEncoding.format ||
    options.valueEncoding !== valueEncoding.format) {
    options = {
      ...options,
      keyEncoding: keyEncoding.format,
      valueEncoding: valueEncoding.format
    }
  }

  this._put(keyEncoding.encode(key), valueEncoding.encode(value), options, (err) => {
    if (err) return callback(err)
    this.emit('put', key, value)
    callback()
  })

  return callback[kPromise]
}

AbstractLevelDOWN.prototype._put = function (key, value, options, callback) {
  this.nextTick(callback)
}

AbstractLevelDOWN.prototype.del = function (key, options, callback) {
  callback = getCallback(options, callback)
  callback = fromCallback(callback, kPromise)
  options = getOptions(options, this[kDefaultOptions].key)

  if (this[kStatus] === 'opening') {
    this.defer(() => this.del(key, options, callback))
    return callback[kPromise]
  }

  if (maybeError(this, callback)) {
    return callback[kPromise]
  }

  const err = this._checkKey(key)

  if (err) {
    this.nextTick(callback, err)
    return callback[kPromise]
  }

  const keyEncoding = this.keyEncoding(options.keyEncoding)

  // Forward encoding options
  if (options.keyEncoding !== keyEncoding.format) {
    options = { ...options, keyEncoding: keyEncoding.format }
  }

  this._del(keyEncoding.encode(key), options, (err) => {
    if (err) return callback(err)
    this.emit('del', key)
    callback()
  })

  return callback[kPromise]
}

AbstractLevelDOWN.prototype._del = function (key, options, callback) {
  this.nextTick(callback)
}

AbstractLevelDOWN.prototype.batch = function (operations, options, callback) {
  if (!arguments.length) {
    if (this[kStatus] === 'opening') return new DefaultChainedBatch(this)
    if (this[kStatus] !== 'open') {
      throw new ModuleError('Database is not open', {
        code: 'LEVEL_DATABASE_NOT_OPEN'
      })
    }
    return this._chainedBatch()
  }

  if (typeof operations === 'function') callback = operations
  else callback = getCallback(options, callback)

  callback = fromCallback(callback, kPromise)
  options = getOptions(options, this[kDefaultOptions].entry)

  if (this[kStatus] === 'opening') {
    this.defer(() => this.batch(operations, options, callback))
    return callback[kPromise]
  }

  if (maybeError(this, callback)) {
    return callback[kPromise]
  }

  if (!Array.isArray(operations)) {
    this.nextTick(callback, new TypeError("The first argument 'operations' must be an array"))
    return callback[kPromise]
  }

  if (operations.length === 0) {
    this.nextTick(callback)
    return callback[kPromise]
  }

  const encoded = new Array(operations.length)
  const { keyEncoding: ke, valueEncoding: ve, ...rest } = options

  for (let i = 0; i < operations.length; i++) {
    if (typeof operations[i] !== 'object' || operations[i] === null) {
      this.nextTick(callback, new TypeError('A batch operation must be an object'))
      return callback[kPromise]
    }

    const op = Object.assign({}, operations[i])

    if (op.type !== 'put' && op.type !== 'del') {
      this.nextTick(callback, new TypeError("A batch operation must have a type property that is 'put' or 'del'"))
      return callback[kPromise]
    }

    const err = this._checkKey(op.key)

    if (err) {
      this.nextTick(callback, err)
      return callback[kPromise]
    }

    const keyEncoding = this.keyEncoding(op.keyEncoding || ke)

    op.key = keyEncoding.encode(op.key)
    op.keyEncoding = keyEncoding.format

    if (op.type === 'put') {
      const valueErr = this._checkValue(op.value)

      if (valueErr) {
        this.nextTick(callback, valueErr)
        return callback[kPromise]
      }

      const valueEncoding = this.valueEncoding(op.valueEncoding || ve)

      op.value = valueEncoding.encode(op.value)
      op.valueEncoding = valueEncoding.format
    }

    encoded[i] = op
  }

  this._batch(encoded, rest, (err) => {
    if (err) return callback(err)
    this.emit('batch', operations)
    callback()
  })

  return callback[kPromise]
}

AbstractLevelDOWN.prototype._batch = function (operations, options, callback) {
  this.nextTick(callback)
}

AbstractLevelDOWN.prototype.clear = function (options, callback) {
  callback = getCallback(options, callback)
  callback = fromCallback(callback, kPromise)
  options = getOptions(options, this[kDefaultOptions].empty)

  if (this[kStatus] === 'opening') {
    this.defer(() => this.clear(options, callback))
    return callback[kPromise]
  }

  if (maybeError(this, callback)) {
    return callback[kPromise]
  }

  const { keyEncoding: ke, ...original } = options
  const keyEncoding = this.keyEncoding(ke)

  options = rangeOptions(options, keyEncoding)
  options.keyEncoding = keyEncoding.format

  this._clear(options, (err) => {
    if (err) return callback(err)
    // TODO: should this include encoding options? a batch event does
    this.emit('clear', original)
    callback()
  })

  return callback[kPromise]
}

AbstractLevelDOWN.prototype._clear = function (options, callback) {
  this.nextTick(callback)
}

AbstractLevelDOWN.prototype.iterator = function (options) {
  const keyEncoding = this.keyEncoding(options && options.keyEncoding)
  const valueEncoding = this.valueEncoding(options && options.valueEncoding)

  options = rangeOptions(options, keyEncoding)
  options.keys = options.keys !== false
  options.values = options.values !== false

  // We need the original encoding options in AbstractIterator in order to decode data
  Object.defineProperty(options, AbstractIterator.keyEncoding, { value: keyEncoding })
  Object.defineProperty(options, AbstractIterator.valueEncoding, { value: valueEncoding })

  // Forward encoding options to the underlying store
  options.keyEncoding = keyEncoding.format
  options.valueEncoding = valueEncoding.format

  if (this[kStatus] === 'opening') {
    return new DeferredIterator(this, options)
  }

  if (this[kStatus] !== 'open') {
    throw new ModuleError('Database is not open', {
      code: 'LEVEL_DATABASE_NOT_OPEN'
    })
  }

  return this._iterator(options)
}

AbstractLevelDOWN.prototype._iterator = function (options) {
  return new AbstractIterator(this, options)
}

// TODO: docs
// When deferring an operation, do it early: after normalizing optional arguments but
// before serializing (to prevent double serialization and to emit original input if
// the operation has events) and before any fast paths (to prevent calling back before
// db has finished opening). Resources that can be closed on their own (like iterators
// and chained batches) should however first check such state before deferring, in
// order to reject operations after close (including when the db was reopened).
AbstractLevelDOWN.prototype.defer = function (fn) {
  if (typeof fn !== 'function') {
    throw new TypeError('The first argument must be a function')
  }

  this[kOperations].push(fn)
}

AbstractLevelDOWN.prototype[kUndefer] = function () {
  if (this[kOperations].length === 0) {
    return
  }

  const operations = this[kOperations]
  this[kOperations] = []

  for (const op of operations) {
    op()
  }
}

// TODO: docs
AbstractLevelDOWN.prototype.attachResource = function (resource) {
  if (typeof resource !== 'object' || resource === null ||
    typeof resource.close !== 'function') {
    throw new TypeError('The first argument must be a resource object')
  }

  this[kResources].add(resource)
}

// TODO: docs
AbstractLevelDOWN.prototype.detachResource = function (resource) {
  this[kResources].delete(resource)
}

AbstractLevelDOWN.prototype._chainedBatch = function () {
  return new DefaultChainedBatch(this)
}

AbstractLevelDOWN.prototype._checkKey = function (key) {
  if (key === null || key === undefined) {
    return new ModuleError('Key cannot be null or undefined', {
      code: 'LEVEL_INVALID_KEY'
    })
  }
}

AbstractLevelDOWN.prototype._checkValue = function (value) {
  if (value === null || value === undefined) {
    return new ModuleError('Value cannot be null or undefined', {
      code: 'LEVEL_INVALID_VALUE'
    })
  }
}

// Expose browser-compatible nextTick for dependents
// TODO: after we drop node 10, also use queueMicrotask in node
AbstractLevelDOWN.prototype.nextTick = require('./next-tick')

module.exports = AbstractLevelDOWN

function maybeError (db, callback) {
  if (db[kStatus] !== 'open') {
    db.nextTick(callback, new ModuleError('Database is not open', {
      code: 'LEVEL_DATABASE_NOT_OPEN'
    }))
    return true
  }

  return false
}
