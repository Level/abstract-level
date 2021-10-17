'use strict'

const supports = require('level-supports')
const isBuffer = require('is-buffer')
const { EventEmitter } = require('events')
const { fromCallback } = require('catering')
const AbstractIterator = require('./abstract-iterator')
const DeferredIterator = require('./lib/deferred-iterator')
const DefaultChainedBatch = require('./lib/default-chained-batch')
const { getCallback, getOptions } = require('./lib/common')

const hasOwnProperty = Object.prototype.hasOwnProperty
const rangeOptions = ['lt', 'lte', 'gt', 'gte']
const kPromise = Symbol('promise')
const kLanded = Symbol('landed')
const kResources = Symbol('resources')
const kCloseResources = Symbol('closeResources')
const kOperations = Symbol('operations')
const kUndefer = Symbol('undefer')
const kDeferOpen = Symbol('deferOpen')
const kOptions = Symbol('options')
const kStatus = Symbol('status')
const noop = () => {}

// TODO: document new options and callback arguments
// TODO: and test them, also as testCommon.factory() arguments
function AbstractLevelDOWN (manifest, options, callback) {
  if (typeof manifest !== 'object' && manifest != null) {
    throw new TypeError('First argument must be null, undefined or an object')
  }

  callback = getCallback(options, callback)
  options = getOptions(options)
  manifest = manifest || {}

  EventEmitter.call(this)

  this[kResources] = new Set()
  this[kOperations] = []
  this[kDeferOpen] = true
  this[kOptions] = options
  this[kStatus] = 'opening'

  // TODO: add openCallback
  this.supports = supports(manifest, {
    status: true,
    promises: true,
    clear: true,
    getMany: true,
    idempotentOpen: true,
    passiveOpen: true,
    deferredOpen: true,
    serialize: true,
    bufferKeys: true,
    snapshots: manifest.snapshots !== false,
    permanence: manifest.permanence !== false,
    events: {
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

  // Let subclass finish its constructor
  this._nextTick(() => {
    if (this[kDeferOpen]) {
      this.open({ passive: false }, callback || noop)
    } else if (callback) {
      this.open({ passive: true }, callback)
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

AbstractLevelDOWN.prototype.open = function (options, callback) {
  callback = getCallback(options, callback)
  callback = fromCallback(callback, kPromise)

  // TODO: document that levelup did not merge option objects
  options = { ...this[kOptions], ...getOptions(options) }

  options.createIfMissing = options.createIfMissing !== false
  options.errorIfExists = !!options.errorIfExists

  const maybeOpened = (err) => {
    if (this[kStatus] === 'closing' || this[kStatus] === 'opening') {
      // Wait until pending state changes are done
      this.once(kLanded, err ? () => maybeOpened(err) : maybeOpened)
    } else if (this[kStatus] !== 'open') {
      callback(err || new Error('Database is not open'))
    } else {
      callback()
    }
  }

  if (options.passive) {
    if (this[kStatus] === 'opening') {
      this.once(kLanded, maybeOpened)
    } else {
      this._nextTick(maybeOpened)
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
    this._nextTick(maybeOpened)
  } else {
    this.once(kLanded, () => this.open(options, callback))
  }

  return callback[kPromise]
}

AbstractLevelDOWN.prototype._open = function (options, callback) {
  this._nextTick(callback)
}

AbstractLevelDOWN.prototype.close = function (callback) {
  callback = fromCallback(callback, kPromise)

  const maybeClosed = (err) => {
    if (this[kStatus] === 'opening' || this[kStatus] === 'closing') {
      // Wait until pending state changes are done
      this.once(kLanded, err ? maybeClosed(err) : maybeClosed)
    } else if (this[kStatus] !== 'closed') {
      callback(err || new Error('Database is not closed'))
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
    this._nextTick(maybeClosed)
  } else {
    this.once(kLanded, () => this.close(callback))
  }

  return callback[kPromise]
}

AbstractLevelDOWN.prototype[kCloseResources] = function (callback) {
  if (this[kResources].size === 0) {
    return this._nextTick(callback)
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
  this._nextTick(callback)
}

AbstractLevelDOWN.prototype.get = function (key, options, callback) {
  callback = getCallback(options, callback)
  callback = fromCallback(callback, kPromise)
  options = getOptions(options)

  if (this[kStatus] === 'opening') {
    this.defer(() => this.get(key, options, callback))
    return callback[kPromise]
  }

  if (maybeError(this, callback)) {
    return callback[kPromise]
  }

  const err = this._checkKey(key)

  if (err) {
    this._nextTick(callback, err)
    return callback[kPromise]
  }

  key = this._serializeKey(key)
  options.asBuffer = options.asBuffer !== false

  this._get(key, options, callback)
  return callback[kPromise]
}

AbstractLevelDOWN.prototype._get = function (key, options, callback) {
  this.nextTick(callback, new Error('NotFound'))
}

AbstractLevelDOWN.prototype.getMany = function (keys, options, callback) {
  callback = getCallback(options, callback)
  callback = fromCallback(callback, kPromise)
  options = getOptions(options)

  if (this[kStatus] === 'opening') {
    this.defer(() => this.getMany(keys, options, callback))
    return callback[kPromise]
  }

  if (maybeError(this, callback)) {
    return callback[kPromise]
  }

  if (!Array.isArray(keys)) {
    this._nextTick(callback, new Error('getMany() requires an array argument'))
    return callback[kPromise]
  }

  if (keys.length === 0) {
    this._nextTick(callback, null, [])
    return callback[kPromise]
  }

  if (typeof options.asBuffer !== 'boolean') {
    options = { ...options, asBuffer: true }
  }

  const serialized = new Array(keys.length)

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i]
    const err = this._checkKey(key)

    if (err) {
      this._nextTick(callback, err)
      return callback[kPromise]
    }

    serialized[i] = this._serializeKey(key)
  }

  this._getMany(serialized, options, callback)
  return callback[kPromise]
}

AbstractLevelDOWN.prototype._getMany = function (keys, options, callback) {
  this._nextTick(callback, null, new Array(keys.length).fill(undefined))
}

AbstractLevelDOWN.prototype.put = function (key, value, options, callback) {
  callback = getCallback(options, callback)
  callback = fromCallback(callback, kPromise)
  options = getOptions(options)

  if (this[kStatus] === 'opening') {
    this.defer(() => this.put(key, value, options, callback))
    return callback[kPromise]
  }

  if (maybeError(this, callback)) {
    return callback[kPromise]
  }

  const err = this._checkKey(key) || this._checkValue(value)

  if (err) {
    this._nextTick(callback, err)
    return callback[kPromise]
  }

  this._put(this._serializeKey(key), this._serializeValue(value), options, (err) => {
    if (err) return callback(err)
    this.emit('put', key, value)
    callback()
  })

  return callback[kPromise]
}

AbstractLevelDOWN.prototype._put = function (key, value, options, callback) {
  this._nextTick(callback)
}

AbstractLevelDOWN.prototype.del = function (key, options, callback) {
  callback = getCallback(options, callback)
  callback = fromCallback(callback, kPromise)
  options = getOptions(options)

  if (this[kStatus] === 'opening') {
    this.defer(() => this.del(key, options, callback))
    return callback[kPromise]
  }

  if (maybeError(this, callback)) {
    return callback[kPromise]
  }

  const err = this._checkKey(key)

  if (err) {
    this._nextTick(callback, err)
    return callback[kPromise]
  }

  this._del(this._serializeKey(key), options, (err) => {
    if (err) return callback(err)
    this.emit('del', key)
    callback()
  })

  return callback[kPromise]
}

AbstractLevelDOWN.prototype._del = function (key, options, callback) {
  this._nextTick(callback)
}

AbstractLevelDOWN.prototype.batch = function (array, options, callback) {
  // TODO: deprecate in favor of an explicit db.chainedBatch() method
  if (!arguments.length) {
    if (this[kStatus] === 'opening') return new DefaultChainedBatch(this)
    if (this[kStatus] !== 'open') throw new Error('Database is not open')
    return this._chainedBatch()
  }

  if (typeof array === 'function') callback = array
  else callback = getCallback(options, callback)

  callback = fromCallback(callback, kPromise)
  options = getOptions(options)

  if (this[kStatus] === 'opening') {
    this.defer(() => this.batch(array, options, callback))
    return callback[kPromise]
  }

  if (maybeError(this, callback)) {
    return callback[kPromise]
  }

  if (!Array.isArray(array)) {
    this._nextTick(callback, new Error('batch(array) requires an array argument'))
    return callback[kPromise]
  }

  if (array.length === 0) {
    this._nextTick(callback)
    return callback[kPromise]
  }

  const serialized = new Array(array.length)

  for (let i = 0; i < array.length; i++) {
    if (typeof array[i] !== 'object' || array[i] === null) {
      this._nextTick(callback, new Error('batch(array) element must be an object and not `null`'))
      return callback[kPromise]
    }

    const e = Object.assign({}, array[i])

    if (e.type !== 'put' && e.type !== 'del') {
      this._nextTick(callback, new Error("`type` must be 'put' or 'del'"))
      return callback[kPromise]
    }

    const err = this._checkKey(e.key)

    if (err) {
      this._nextTick(callback, err)
      return callback[kPromise]
    }

    e.key = this._serializeKey(e.key)

    if (e.type === 'put') {
      const valueErr = this._checkValue(e.value)

      if (valueErr) {
        this._nextTick(callback, valueErr)
        return callback[kPromise]
      }

      e.value = this._serializeValue(e.value)
    }

    serialized[i] = e
  }

  this._batch(serialized, options, (err) => {
    if (err) return callback(err)
    this.emit('batch', array)
    callback()
  })

  return callback[kPromise]
}

AbstractLevelDOWN.prototype._batch = function (array, options, callback) {
  this._nextTick(callback)
}

AbstractLevelDOWN.prototype.clear = function (options, callback) {
  callback = getCallback(options, callback)
  callback = fromCallback(callback, kPromise)

  if (this[kStatus] === 'opening') {
    this.defer(() => this.clear(options, callback))
    return callback[kPromise]
  }

  if (maybeError(this, callback)) {
    return callback[kPromise]
  }

  const originalOptions = options || {}

  options = cleanRangeOptions(this, options)
  options.reverse = !!options.reverse
  options.limit = typeof options.limit === 'number' && options.limit !== Infinity ? options.limit : -1

  this._clear(options, (err) => {
    if (err) return callback(err)
    this.emit('clear', originalOptions)
    callback()
  })

  return callback[kPromise]
}

// TODO: consider removing this default implementation
AbstractLevelDOWN.prototype._clear = function (options, callback) {
  // Avoid setupIteratorOptions, would serialize range options a second time.
  options.keys = true
  options.values = false
  options.keyAsBuffer = true
  options.valueAsBuffer = true

  const iterator = this._iterator(options)
  const emptyOptions = {}

  const next = (err) => {
    if (err) {
      return iterator.close(function () {
        callback(err)
      })
    }

    iterator.next((err, key) => {
      if (err) return next(err)
      if (key === undefined) return iterator.close(callback)

      // This could be optimized by using a batch, but the default _clear
      // is not meant to be fast. Implementations have more room to optimize
      // if they override _clear. Note: using _del bypasses key serialization.
      this._del(key, emptyOptions, next)
    })
  }

  next()
}

AbstractLevelDOWN.prototype._setupIteratorOptions = function (options) {
  options = cleanRangeOptions(this, options)

  options.reverse = !!options.reverse
  options.keys = options.keys !== false
  options.values = options.values !== false
  options.limit = typeof options.limit === 'number' && options.limit !== Infinity ? options.limit : -1
  options.keyAsBuffer = options.keyAsBuffer !== false
  options.valueAsBuffer = options.valueAsBuffer !== false

  return options
}

function cleanRangeOptions (db, options) {
  const result = {}

  for (const k in options) {
    if (!hasOwnProperty.call(options, k)) continue

    if (k === 'start' || k === 'end') {
      throw new Error('Legacy range options ("start" and "end") have been removed')
    }

    let opt = options[k]

    if (isRangeOption(k)) {
      // Note that we don't reject nullish and empty options here. While
      // those types are invalid as keys, they are valid as range options.
      opt = db._serializeKey(opt)
    }

    result[k] = opt
  }

  return result
}

function isRangeOption (k) {
  return rangeOptions.includes(k)
}

AbstractLevelDOWN.prototype.iterator = function (options) {
  if (typeof options !== 'object' || options === null) options = {}
  if (this[kStatus] === 'opening') return new DeferredIterator(this, options)
  if (this[kStatus] !== 'open') throw new Error('Database is not open')
  options = this._setupIteratorOptions(options)
  return this._iterator(options)
}

AbstractLevelDOWN.prototype._iterator = function (options) {
  return new AbstractIterator(this)
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

  /* istanbul ignore if: assertion */
  if (this[kOperations].length > 0) {
    throw new Error('Did not expect further operations')
  }
}

// TODO: docs
AbstractLevelDOWN.prototype.attachResource = function (resource) {
  if (typeof resource !== 'object' || resource === null ||
    typeof resource.close !== 'function') {
    throw new TypeError('First argument must be a resource')
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

AbstractLevelDOWN.prototype._serializeKey = function (key) {
  return key
}

AbstractLevelDOWN.prototype._serializeValue = function (value) {
  return value
}

AbstractLevelDOWN.prototype._checkKey = function (key) {
  if (key === null || key === undefined) {
    return new Error('key cannot be `null` or `undefined`')
  } else if (isBuffer(key) && key.length === 0) { // TODO: replace with typed array check
    return new Error('key cannot be an empty Buffer')
  } else if (key === '') {
    return new Error('key cannot be an empty String')
  } else if (Array.isArray(key) && key.length === 0) {
    return new Error('key cannot be an empty Array')
  }
}

AbstractLevelDOWN.prototype._checkValue = function (value) {
  if (value === null || value === undefined) {
    return new Error('value cannot be `null` or `undefined`')
  }
}

// Expose browser-compatible nextTick for dependents
// TODO: docs
// TODO: remove _nextTick alias
// TODO: after we drop node 10, also use queueMicrotask in node
AbstractLevelDOWN.prototype.nextTick =
AbstractLevelDOWN.prototype._nextTick = require('./next-tick')

module.exports = AbstractLevelDOWN

function maybeError (db, callback) {
  if (db[kStatus] !== 'open') {
    db._nextTick(callback, new Error('Database is not open'))
    return true
  }

  return false
}
