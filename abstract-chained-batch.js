'use strict'

const { fromCallback } = require('catering')
const ModuleError = require('module-error')
const { getCallback, getOptions } = require('./lib/common')

const kPromise = Symbol('promise')
const kStatus = Symbol('status')
const kOperations = Symbol('operations')
const kFinishClose = Symbol('finishClose')
const kCloseCallbacks = Symbol('closeCallbacks')

function AbstractChainedBatch (db) {
  if (typeof db !== 'object' || db === null) {
    const hint = db === null ? 'null' : typeof db
    throw new TypeError(`The first argument must be an abstract-level database, received ${hint}`)
  }

  this[kOperations] = []
  this[kCloseCallbacks] = []
  this[kStatus] = 'open'
  this[kFinishClose] = this[kFinishClose].bind(this)

  this.db = db
  this.db.attachResource(this)
  this.nextTick = db.nextTick
}

Object.defineProperty(AbstractChainedBatch.prototype, 'length', {
  enumerable: true,
  get () {
    return this[kOperations].length
  }
})

AbstractChainedBatch.prototype.put = function (key, value, options) {
  if (this[kStatus] !== 'open') {
    throw new ModuleError('Batch is not open: cannot call put() after write() or close()', {
      code: 'LEVEL_BATCH_NOT_OPEN'
    })
  }

  const err = this.db._checkKey(key) || this.db._checkValue(value)
  if (err) throw err

  const keyEncoding = this.db.keyEncoding(options && options.keyEncoding)
  const valueEncoding = this.db.valueEncoding(options && options.valueEncoding)
  const original = options

  // Forward encoding options
  if (!options || options.keyEncoding !== keyEncoding.format ||
    options.valueEncoding !== valueEncoding.format) {
    options = {
      ...options,
      keyEncoding: keyEncoding.format,
      valueEncoding: valueEncoding.format
    }
  }

  this._put(keyEncoding.encode(key), valueEncoding.encode(value), options)
  this[kOperations].push({ ...original, type: 'put', key, value })

  return this
}

AbstractChainedBatch.prototype._put = function (key, value, options) {}

AbstractChainedBatch.prototype.del = function (key, options) {
  if (this[kStatus] !== 'open') {
    throw new ModuleError('Batch is not open: cannot call del() after write() or close()', {
      code: 'LEVEL_BATCH_NOT_OPEN'
    })
  }

  const err = this.db._checkKey(key)
  if (err) throw err

  const original = options
  const keyEncoding = this.db.keyEncoding(options && options.keyEncoding)

  // Forward encoding options
  if (!options || options.keyEncoding !== keyEncoding.format) {
    options = { ...options, keyEncoding: keyEncoding.format }
  }

  this._del(keyEncoding.encode(key), options)
  this[kOperations].push({ ...original, type: 'del', key })

  return this
}

AbstractChainedBatch.prototype._del = function (key, options) {}

AbstractChainedBatch.prototype.clear = function () {
  if (this[kStatus] !== 'open') {
    throw new ModuleError('Batch is not open: cannot call clear() after write() or close()', {
      code: 'LEVEL_BATCH_NOT_OPEN'
    })
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
    this.nextTick(callback, new ModuleError('Batch is not open: cannot call write() after write() or close()', {
      code: 'LEVEL_BATCH_NOT_OPEN'
    }))
  } else if (this.length === 0) {
    this.close(callback)
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

AbstractChainedBatch.prototype.close = function (callback) {
  callback = fromCallback(callback, kPromise)

  if (this[kStatus] === 'closing') {
    this[kCloseCallbacks].push(callback)
  } else if (this[kStatus] === 'closed') {
    this.nextTick(callback)
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
  this.nextTick(callback)
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

module.exports = AbstractChainedBatch
