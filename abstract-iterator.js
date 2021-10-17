'use strict'

const { fromCallback } = require('catering')

const kPromise = Symbol('promise')
const kNextCallback = Symbol('nextCallback')
const kNexting = Symbol('nexting')
const kFinishNext = Symbol('finishNext')
const kClosing = Symbol('closing')
const kFinishClose = Symbol('finishClose')
const kClosed = Symbol('closed')
const kCloseCallbacks = Symbol('closeCallbacks')

function AbstractIterator (db) {
  if (typeof db !== 'object' || db === null) {
    throw new TypeError('First argument must be an abstract-leveldown compliant store')
  }

  this[kClosed] = false
  this[kCloseCallbacks] = []
  this[kNexting] = false
  this[kClosing] = false
  this[kNextCallback] = null
  this[kFinishNext] = this[kFinishNext].bind(this)
  this[kFinishClose] = this[kFinishClose].bind(this)

  this.db = db
  this.db.attachResource(this)
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
    throw new Error('Callback must be a function')
  }

  if (this[kClosing]) {
    this.nextTick(callback, new Error('Iterator is not open'))
  } else if (this[kNexting]) {
    this.nextTick(callback, new Error('Iterator is busy'))
  } else {
    this[kNexting] = true
    this[kNextCallback] = callback

    this._next(this[kFinishNext])
  }

  return promise
}

AbstractIterator.prototype._next = function (callback) {
  this._nextTick(callback)
}

AbstractIterator.prototype[kFinishNext] = function (err, ...rest) {
  const cb = this[kNextCallback]
  this[kNexting] = false
  this[kNextCallback] = null
  if (this[kClosing]) this._close(this[kFinishClose])
  cb(err, ...rest)
}

// TODO: add options argument
AbstractIterator.prototype.seek = function (target) {
  if (this[kClosing]) {
    throw new Error('Iterator is not open')
  } else if (this[kNexting]) {
    throw new Error('Iterator is busy')
  } else {
    this._seek(this.db._serializeKey(target))
  }
}

AbstractIterator.prototype._seek = function (target) {}

AbstractIterator.prototype.close = function (callback) {
  callback = fromCallback(callback, kPromise)

  if (this[kClosed]) {
    this._nextTick(callback)
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
  this._nextTick(callback)
}

// TODO: log deprecation message
AbstractIterator.prototype.end = function (callback) {
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

// Temporary to catch issues upgrading to abstract-leveldown@8
for (const k of ['_ended property', '_nexting property', '_end method']) {
  Object.defineProperty(AbstractIterator.prototype, k.split(' ')[0], {
    get () { throw new Error(`The ${k} has been removed`) },
    set () { throw new Error(`The ${k} has been removed`) }
  })
}

// Expose browser-compatible nextTick for dependents
AbstractIterator.prototype.nextTick =
AbstractIterator.prototype._nextTick = require('./next-tick')

module.exports = AbstractIterator
