'use strict'

const supports = require('level-supports')
const isBuffer = require('is-buffer')
const { fromCallback } = require('catering')
const AbstractIterator = require('./abstract-iterator')
const AbstractChainedBatch = require('./abstract-chained-batch')
const { getCallback, getOptions } = require('./lib/common')

const hasOwnProperty = Object.prototype.hasOwnProperty
const rangeOptions = ['lt', 'lte', 'gt', 'gte']
const kPromise = Symbol('promise')

function AbstractLevelDOWN (manifest) {
  this.status = 'new'

  this.supports = supports(manifest, {
    status: true,
    promises: true,
    clear: true,
    getMany: true
  })
}

AbstractLevelDOWN.prototype.open = function (options, callback) {
  callback = getCallback(options, callback)
  callback = fromCallback(callback, kPromise)
  options = getOptions(options)

  options.createIfMissing = options.createIfMissing !== false
  options.errorIfExists = !!options.errorIfExists

  if (this.status === 'new' || this.status === 'closed') {
    const oldStatus = this.status
    this.status = 'opening'
    this._open(options, (err) => {
      if (err) {
        this.status = oldStatus
        return callback(err)
      }
      this.status = 'open'
      callback()
    })
  } else if (this.status === 'open') {
    this._nextTick(callback)
  } else {
    // Cannot handle yet for lack of events
    this._nextTick(callback, new Error('Database is not open'))
  }

  return callback[kPromise]
}

AbstractLevelDOWN.prototype._open = function (options, callback) {
  this._nextTick(callback)
}

AbstractLevelDOWN.prototype.close = function (callback) {
  callback = fromCallback(callback, kPromise)

  if (this.status === 'open') {
    this.status = 'closing'
    this._close((err) => {
      if (err) {
        this.status = 'open'
        return callback(err)
      }
      this.status = 'closed'
      callback()
    })
  } else if (this.status === 'closed' || this.status === 'new') {
    this._nextTick(callback)
  } else {
    // Cannot handle yet for lack of events
    this._nextTick(callback, new Error('Database is not open'))
  }

  return callback[kPromise]
}

AbstractLevelDOWN.prototype._close = function (callback) {
  this._nextTick(callback)
}

AbstractLevelDOWN.prototype.get = function (key, options, callback) {
  callback = getCallback(options, callback)
  callback = fromCallback(callback, kPromise)
  options = getOptions(options)

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
  this._nextTick(function () { callback(new Error('NotFound')) })
}

AbstractLevelDOWN.prototype.getMany = function (keys, options, callback) {
  callback = getCallback(options, callback)
  callback = fromCallback(callback, kPromise)
  options = getOptions(options)

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

  if (maybeError(this, callback)) {
    return callback[kPromise]
  }

  const err = this._checkKey(key) || this._checkValue(value)

  if (err) {
    this._nextTick(callback, err)
    return callback[kPromise]
  }

  key = this._serializeKey(key)
  value = this._serializeValue(value)

  this._put(key, value, options, callback)
  return callback[kPromise]
}

AbstractLevelDOWN.prototype._put = function (key, value, options, callback) {
  this._nextTick(callback)
}

AbstractLevelDOWN.prototype.del = function (key, options, callback) {
  callback = getCallback(options, callback)
  callback = fromCallback(callback, kPromise)
  options = getOptions(options)

  if (maybeError(this, callback)) {
    return callback[kPromise]
  }

  const err = this._checkKey(key)

  if (err) {
    this._nextTick(callback, err)
    return callback[kPromise]
  }

  key = this._serializeKey(key)
  this._del(key, options, callback)
  return callback[kPromise]
}

AbstractLevelDOWN.prototype._del = function (key, options, callback) {
  this._nextTick(callback)
}

AbstractLevelDOWN.prototype.batch = function (array, options, callback) {
  if (!arguments.length) {
    if (!this.isOperational()) throw new Error('Database is not open')
    return this._chainedBatch()
  }

  if (typeof array === 'function') callback = array
  else callback = getCallback(options, callback)

  callback = fromCallback(callback, kPromise)
  options = getOptions(options)

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

  this._batch(serialized, options, callback)
  return callback[kPromise]
}

AbstractLevelDOWN.prototype._batch = function (array, options, callback) {
  this._nextTick(callback)
}

AbstractLevelDOWN.prototype.clear = function (options, callback) {
  callback = getCallback(options, callback)
  callback = fromCallback(callback, kPromise)

  if (maybeError(this, callback)) {
    return callback[kPromise]
  }

  options = cleanRangeOptions(this, options)
  options.reverse = !!options.reverse
  options.limit = 'limit' in options ? options.limit : -1

  this._clear(options, callback)
  return callback[kPromise]
}

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
      return iterator.end(function () {
        callback(err)
      })
    }

    iterator.next((err, key) => {
      if (err) return next(err)
      if (key === undefined) return iterator.end(callback)

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
  options.limit = 'limit' in options ? options.limit : -1
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
  return rangeOptions.indexOf(k) !== -1
}

AbstractLevelDOWN.prototype.iterator = function (options) {
  if (!this.isOperational()) throw new Error('Database is not open')
  if (typeof options !== 'object' || options === null) options = {}
  options = this._setupIteratorOptions(options)
  return this._iterator(options)
}

AbstractLevelDOWN.prototype._iterator = function (options) {
  return new AbstractIterator(this)
}

AbstractLevelDOWN.prototype._chainedBatch = function () {
  return new AbstractChainedBatch(this)
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

// TODO: docs and tests
AbstractLevelDOWN.prototype.isOperational = function () {
  return this.status === 'open' || this._isOperational()
}

// Implementation may accept operations in other states too
AbstractLevelDOWN.prototype._isOperational = function () {
  return false
}

// Expose browser-compatible nextTick for dependents
// TODO: rename _nextTick to _queueMicrotask
// TODO: after we drop node 10, also use queueMicrotask in node
AbstractLevelDOWN.prototype._nextTick = require('./next-tick')

module.exports = AbstractLevelDOWN

function maybeError (db, callback) {
  if (!db.isOperational()) {
    db._nextTick(callback, new Error('Database is not open'))
    return true
  }

  return false
}
