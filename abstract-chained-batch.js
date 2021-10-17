'use strict'

const { fromCallback } = require('catering')
const { getCallback, getOptions } = require('./lib/common')

const emptyOptions = Object.freeze({})
const kPromise = Symbol('promise')
const kStatus = Symbol('status')
const kOperations = Symbol('operations')
const kFinishClose = Symbol('finishClose')
const kCloseCallbacks = Symbol('closeCallbacks')

function AbstractChainedBatch (db) {
  if (typeof db !== 'object' || db === null) {
    throw new TypeError('First argument must be an abstract-leveldown compliant store')
  }

  this[kOperations] = []
  this[kCloseCallbacks] = []
  this[kStatus] = 'open'
  this[kFinishClose] = this[kFinishClose].bind(this)

  this.db = db
  this.db.attachResource(this)
}

Object.defineProperty(AbstractChainedBatch.prototype, 'length', {
  enumerable: true,
  get () {
    return this[kOperations].length
  }
})

AbstractChainedBatch.prototype.put = function (key, value, options) {
  if (this[kStatus] !== 'open') {
    throw new Error('Batch is not open')
  }

  const err = this.db._checkKey(key) || this.db._checkValue(value)
  if (err) throw err

  const skey = this.db._serializeKey(key)
  const svalue = this.db._serializeValue(value)

  this._put(skey, svalue, options != null ? options : emptyOptions)
  this[kOperations].push({ ...options, type: 'put', key, value })

  return this
}

AbstractChainedBatch.prototype._put = function (key, value, options) {}

AbstractChainedBatch.prototype.del = function (key, options) {
  if (this[kStatus] !== 'open') {
    throw new Error('Batch is not open')
  }

  const err = this.db._checkKey(key)
  if (err) throw err

  this._del(this.db._serializeKey(key), options != null ? options : emptyOptions)
  this[kOperations].push({ ...options, type: 'del', key })

  return this
}

AbstractChainedBatch.prototype._del = function (key, options) {}

AbstractChainedBatch.prototype.clear = function () {
  if (this[kStatus] !== 'open') {
    throw new Error('Batch is not open')
  }

  this._clear()
  this[kOperations] = []

  return this
}

AbstractChainedBatch.prototype._clear = function () {}

AbstractChainedBatch.prototype.write = function (options, callback) {
  callback = getCallback(options, callback)
  callback = fromCallback(callback, kPromise)
  options = getOptions(options)

  if (this[kStatus] !== 'open') {
    this._nextTick(callback, new Error('Batch is not open'))
  } else {
    this[kStatus] = 'writing'
    this._write(options, (err) => {
      this[kStatus] = 'closing'
      this[kCloseCallbacks].push(() => callback(err))

      // Emit after setting 'closing' status, because event may trigger a
      // db close which in turn triggers (idempotently) closing this batch.
      if (!err) this.db.emit('batch', this[kOperations])

      this._close(this[kFinishClose])
    })
  }

  return callback[kPromise]
}

AbstractChainedBatch.prototype._write = function (options, callback) {}

// TODO: docs (and recommend that e.g. leveldown should cleanup)
AbstractChainedBatch.prototype.close = function (callback) {
  callback = fromCallback(callback, kPromise)

  if (this[kStatus] === 'closing') {
    this[kCloseCallbacks].push(callback)
  } else if (this[kStatus] === 'closed') {
    this._nextTick(callback)
  } else {
    this[kCloseCallbacks].push(callback)

    if (this[kStatus] !== 'writing') {
      this[kStatus] = 'closing'
      this._close(this[kFinishClose])
    }
  }

  return callback[kPromise]
}

AbstractChainedBatch.prototype._close = function (callback) {
  this._nextTick(callback)
}

AbstractChainedBatch.prototype[kFinishClose] = function () {
  this[kStatus] = 'closed'
  this.db.detachResource(this)

  const callbacks = this[kCloseCallbacks]
  this[kCloseCallbacks] = []

  for (const cb of callbacks) {
    cb()
  }
}

// Expose browser-compatible nextTick for dependents
AbstractChainedBatch.prototype.nextTick =
AbstractChainedBatch.prototype._nextTick = require('./next-tick')

module.exports = AbstractChainedBatch
