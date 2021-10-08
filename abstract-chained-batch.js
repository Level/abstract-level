'use strict'

const { fromCallback } = require('catering')
const { getCallback, getOptions } = require('./lib/common')

const emptyOptions = Object.freeze({})
const kLength = Symbol('length')
const kPromise = Symbol('promise')
const kStatus = Symbol('status')
const kOperations = Symbol('operations')
const kFinishClose = Symbol('finishClose')
const kCloseCallbacks = Symbol('closeCallbacks')

function AbstractChainedBatch (db) {
  if (typeof db !== 'object' || db === null) {
    throw new TypeError('First argument must be an abstract-leveldown compliant store')
  }

  this.db = db
  this[kOperations] = []
  this[kLength] = 0
  this[kCloseCallbacks] = []
  this[kStatus] = 'open'
}

Object.defineProperty(AbstractChainedBatch.prototype, 'length', {
  // Allow implementations to implement it differently if needed
  configurable: true,
  enumerable: true,
  get () {
    return this[kLength]
  }
})

AbstractChainedBatch.prototype.put = function (key, value, options) {
  if (this[kStatus] !== 'open') {
    throw new Error('Batch is not open')
  } else if (!this.db.isOperational()) {
    throw new Error('Database is not open')
  }

  const err = this.db._checkKey(key) || this.db._checkValue(value)
  if (err) throw err

  key = this.db._serializeKey(key)
  value = this.db._serializeValue(value)

  this._put(key, value, options != null ? options : emptyOptions)
  this[kLength]++

  return this
}

AbstractChainedBatch.prototype._put = function (key, value, options) {
  this[kOperations].push({ ...options, type: 'put', key, value })
}

AbstractChainedBatch.prototype.del = function (key, options) {
  if (this[kStatus] !== 'open') {
    throw new Error('Batch is not open')
  } else if (!this.db.isOperational()) {
    throw new Error('Database is not open')
  }

  const err = this.db._checkKey(key)
  if (err) throw err

  key = this.db._serializeKey(key)
  this._del(key, options != null ? options : emptyOptions)
  this[kLength]++

  return this
}

AbstractChainedBatch.prototype._del = function (key, options) {
  this[kOperations].push({ ...options, type: 'del', key })
}

AbstractChainedBatch.prototype.clear = function () {
  if (this[kStatus] !== 'open') {
    throw new Error('Batch is not open')
  } else if (!this.db.isOperational()) {
    throw new Error('Database is not open')
  }

  this._clear()
  this[kLength] = 0

  return this
}

AbstractChainedBatch.prototype._clear = function () {
  this[kOperations] = []
}

AbstractChainedBatch.prototype.write = function (options, callback) {
  callback = getCallback(options, callback)
  callback = fromCallback(callback, kPromise)
  options = getOptions(options)

  if (this[kStatus] !== 'open') {
    this._nextTick(callback, new Error('Batch is not open'))
  } else if (!this.db.isOperational()) {
    this._nextTick(callback, new Error('Database is not open'))
  } else {
    this[kStatus] = 'writing'
    this._write(options, (err) => {
      this[kStatus] = 'closing'
      this[kCloseCallbacks].push((err2) => callback(err || err2))

      // Avoid an extra tick for backwards compatibility with < 8.0.0
      if (this._close === defaultClose) {
        this[kFinishClose]()
      } else {
        this._close(this[kFinishClose].bind(this))
      }
    })
  }

  return callback[kPromise]
}

AbstractChainedBatch.prototype._write = function (options, callback) {
  this.db._batch(this[kOperations], options, callback)
}

// TODO: docs
AbstractChainedBatch.prototype.close = function (callback) {
  callback = fromCallback(callback, kPromise)

  if (this[kStatus] === 'closing') {
    this[kCloseCallbacks].push(callback)
  } else if (this[kStatus] === 'closed') {
    this._nextTick(callback)
  } else if (!this.db.isOperational() && this.db.status !== 'closing') {
    this._nextTick(callback, new Error('Database is not open'))
  } else {
    this[kCloseCallbacks].push(callback)

    if (this[kStatus] !== 'writing') {
      this[kStatus] = 'closing'
      this._close(this[kFinishClose].bind(this))
    }
  }

  return callback[kPromise]
}

AbstractChainedBatch.prototype._close = defaultClose

function defaultClose (callback) {
  this._nextTick(callback)
}

AbstractChainedBatch.prototype[kFinishClose] = function (err) {
  this[kStatus] = 'closed'
  this.db.detachResource(this)

  const callbacks = this[kCloseCallbacks]
  this[kCloseCallbacks] = []

  for (const cb of callbacks) {
    cb(err)
  }
}

// Expose browser-compatible nextTick for dependents
AbstractChainedBatch.prototype._nextTick = require('./next-tick')

module.exports = AbstractChainedBatch
