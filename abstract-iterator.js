'use strict'

const { fromCallback } = require('catering')

const kPromise = Symbol('promise')
const kFinishEnd = Symbol('finishEnd')
const kEndFinished = Symbol('endFinished')
const kEndCallbacks = Symbol('endCallbacks')

function AbstractIterator (db) {
  if (typeof db !== 'object' || db === null) {
    throw new TypeError('First argument must be an abstract-leveldown compliant store')
  }

  this[kEndFinished] = false
  this[kEndCallbacks] = []

  this.db = db
  this._ended = false
  this._nexting = false
}

AbstractIterator.prototype.next = function (callback) {
  // In callback mode, we return `this`
  // TODO: remove that in a future major
  let ret = this

  if (callback === undefined) {
    ret = new Promise(function (resolve, reject) {
      callback = function (err, key, value) {
        if (err) reject(err)
        else if (key === undefined && value === undefined) resolve()
        else resolve([key, value])
      }
    })
  } else if (typeof callback !== 'function') {
    throw new Error('next() requires a callback argument')
  }

  if (!this.db.isOperational()) {
    this._nextTick(callback, new Error('Database is not open'))
    return ret
  }

  if (this._ended) {
    this._nextTick(callback, new Error('cannot call next() after end()'))
    return ret
  }

  if (this._nexting) {
    this._nextTick(callback, new Error('cannot call next() before previous next() has completed'))
    return ret
  }

  this._nexting = true
  this._next((err, ...rest) => {
    this._nexting = false
    if (this[kEndCallbacks].length > 0) this._end(this[kFinishEnd].bind(this))
    callback(err, ...rest)
  })

  return ret
}

AbstractIterator.prototype._next = function (callback) {
  this._nextTick(callback)
}

AbstractIterator.prototype.seek = function (target) {
  if (!this.db.isOperational()) {
    throw new Error('Database is not open')
  }

  if (this._ended) {
    throw new Error('cannot call seek() after end()')
  }

  if (this._nexting) {
    throw new Error('cannot call seek() before next() has completed')
  }

  target = this.db._serializeKey(target)
  this._seek(target)
}

AbstractIterator.prototype._seek = function (target) {}

AbstractIterator.prototype.end = function (callback) {
  callback = fromCallback(callback, kPromise)

  if (this._ended && !this[kEndFinished]) {
    this[kEndCallbacks].push(callback)
  } else if (this._ended) {
    this._nextTick(callback)
  } else if (!this.db.isOperational() && this.db.status !== 'closing') {
    this._nextTick(callback, new Error('Database is not open'))
  } else {
    this._ended = true
    this[kEndCallbacks].push(callback)

    if (!this._nexting) {
      this._end(this[kFinishEnd].bind(this))
    }
  }

  return callback[kPromise]
}

AbstractIterator.prototype._end = function (callback) {
  this._nextTick(callback)
}

// TODO: deprecate end() in favor of close()
AbstractIterator.prototype.close = function (callback) {
  return this.end(callback)
}

AbstractIterator.prototype[kFinishEnd] = function (err) {
  this[kEndFinished] = true
  this.db.detachResource(this)

  const callbacks = this[kEndCallbacks]
  this[kEndCallbacks] = []

  for (const cb of callbacks) {
    cb(err)
  }
}

AbstractIterator.prototype[Symbol.asyncIterator] = async function * () {
  try {
    let kv

    while ((kv = (await this.next())) !== undefined) {
      yield kv
    }
  } finally {
    if (!this._ended) await this.end()
  }
}

// Expose browser-compatible nextTick for dependents
AbstractIterator.prototype._nextTick = require('./next-tick')

module.exports = AbstractIterator
