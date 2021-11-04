'use strict'

const { fromCallback } = require('catering')
const ModuleError = require('module-error')
const { getOptions } = require('./lib/common')

const kPromise = Symbol('promise')
const kNextCallback = Symbol('nextCallback')
const kNexting = Symbol('nexting')
const kFinishNext = Symbol('finishNext')
const kClosing = Symbol('closing')
const kFinishClose = Symbol('finishClose')
const kClosed = Symbol('closed')
const kCloseCallbacks = Symbol('closeCallbacks')
const kKeyEncoding = Symbol('keyEncoding')
const kValueEncoding = Symbol('valueEncoding')
const kKeys = Symbol('keys')
const kValues = Symbol('values')

function AbstractIterator (db, options) {
  if (typeof db !== 'object' || db === null) {
    const hint = db === null ? 'null' : typeof db
    throw new TypeError(`The first argument must be an abstract-level database, received ${hint}`)
  }

  if (typeof options !== 'object' || options === null) {
    throw new TypeError('The second argument must be an options object')
  }

  this[kClosed] = false
  this[kCloseCallbacks] = []
  this[kNexting] = false
  this[kClosing] = false
  this[kNextCallback] = null
  this[kFinishNext] = this[kFinishNext].bind(this)
  this[kFinishClose] = this[kFinishClose].bind(this)
  this[kKeyEncoding] = options[kKeyEncoding]
  this[kValueEncoding] = options[kValueEncoding]
  this[kKeys] = options.keys !== false
  this[kValues] = options.values !== false

  this.db = db
  this.db.attachResource(this)
  this.nextTick = db.nextTick
}

AbstractIterator.prototype.next = function (callback) {
  let promise

  if (callback === undefined) {
    promise = new Promise(function (resolve, reject) {
      callback = function (err, key, value) {
        if (err) reject(err)
        else if (key === undefined && value === undefined) resolve()
        else resolve([key, value])
      }
    })
  } else if (typeof callback !== 'function') {
    throw new TypeError('The first argument must be a function or undefined')
  }

  if (this[kClosing]) {
    this.nextTick(callback, new ModuleError('Iterator is not open: cannot call next() after close()', {
      code: 'LEVEL_ITERATOR_NOT_OPEN'
    }))
  } else if (this[kNexting]) {
    this.nextTick(callback, new ModuleError('Iterator is busy: cannot call next() until previous call has completed', {
      code: 'LEVEL_ITERATOR_BUSY'
    }))
  } else {
    this[kNexting] = true
    this[kNextCallback] = callback

    this._next(this[kFinishNext])
  }

  return promise
}

AbstractIterator.prototype._next = function (callback) {
  this.nextTick(callback)
}

AbstractIterator.prototype[kFinishNext] = function (err, key, value) {
  const cb = this[kNextCallback]

  this[kNexting] = false
  this[kNextCallback] = null

  if (this[kClosing]) this._close(this[kFinishClose])

  try {
    if (this[kKeys] && key != null) {
      key = this[kKeyEncoding].decode(key)
    } else {
      key = undefined
    }
  } catch (err) {
    return cb(new ModuleError('Iterator could not decode key', {
      code: 'LEVEL_DECODE_ERROR',
      cause: err
    }))
  }

  try {
    if (this[kValues] && value != null) {
      value = this[kValueEncoding].decode(value)
    } else {
      value = undefined
    }
  } catch (err) {
    return cb(new ModuleError('Iterator could not decode value', {
      code: 'LEVEL_DECODE_ERROR',
      cause: err
    }))
  }

  cb(err, key, value)
}

AbstractIterator.prototype.seek = function (target, options) {
  options = getOptions(options)

  if (this[kClosing]) {
    // Don't throw here, to be kind to implementations that wrap
    // another db and don't necessarily control when the db is closed
  } else if (this[kNexting]) {
    throw new ModuleError('Iterator is busy: cannot call seek() until next() has completed', {
      code: 'LEVEL_ITERATOR_BUSY'
    })
  } else {
    const keyEncoding = this.db.keyEncoding(
      options.keyEncoding || this[kKeyEncoding]
    )

    if (options.keyEncoding !== keyEncoding.format) {
      options = { ...options, keyEncoding: keyEncoding.format }
    }

    this._seek(keyEncoding.encode(target), options)
  }
}

AbstractIterator.prototype._seek = function (target, options) {}

AbstractIterator.prototype.close = function (callback) {
  callback = fromCallback(callback, kPromise)

  if (this[kClosed]) {
    this.nextTick(callback)
  } else if (this[kClosing]) {
    this[kCloseCallbacks].push(callback)
  } else {
    this[kClosing] = true
    this[kCloseCallbacks].push(callback)

    if (!this[kNexting]) {
      this._close(this[kFinishClose])
    }
  }

  return callback[kPromise]
}

AbstractIterator.prototype._close = function (callback) {
  this.nextTick(callback)
}

let warnedEnd = false
AbstractIterator.prototype.end = function (callback) {
  if (!warnedEnd && typeof console !== 'undefined') {
    warnedEnd = true
    console.warn(new ModuleError(
      'The iterator.end() method was renamed to close() and end() is an alias that will be removed in a future version',
      { code: 'LEVEL_LEGACY' }
    ))
  }

  return this.close(callback)
}

AbstractIterator.prototype[kFinishClose] = function () {
  this[kClosed] = true
  this.db.detachResource(this)

  const callbacks = this[kCloseCallbacks]
  this[kCloseCallbacks] = []

  for (const cb of callbacks) {
    cb()
  }
}

AbstractIterator.prototype[Symbol.asyncIterator] = async function * () {
  try {
    let kv

    while ((kv = (await this.next())) !== undefined) {
      yield kv
    }
  } finally {
    if (!this[kClosed]) await this.close()
  }
}

// To help migrating to abstract-level
for (const k of ['_ended property', '_nexting property', '_end method']) {
  Object.defineProperty(AbstractIterator.prototype, k.split(' ')[0], {
    get () { throw new ModuleError(`The ${k} has been removed`, { code: 'LEVEL_LEGACY' }) },
    set () { throw new ModuleError(`The ${k} has been removed`, { code: 'LEVEL_LEGACY' }) }
  })
}

// Exposed so that AbstractLevel can set these options
AbstractIterator.keyEncoding = kKeyEncoding
AbstractIterator.valueEncoding = kValueEncoding

module.exports = AbstractIterator
