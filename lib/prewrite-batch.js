'use strict'

const { prefixDescendantKey } = require('./prefixes')

const kDb = Symbol('db')
const kPrivateOperations = Symbol('privateOperations')
const kPublicOperations = Symbol('publicOperations')

// An interface for prewrite hook functions to add operations
class PrewriteBatch {
  constructor (db, privateOperations, publicOperations) {
    this[kDb] = db

    // Note: if for db.batch([]), these arrays include input operations (or empty slots
    // for them) but if for chained batch then it does not. Small implementation detail.
    this[kPrivateOperations] = privateOperations
    this[kPublicOperations] = publicOperations
  }

  add (op) {
    const isPut = op.type === 'put'
    const delegated = op.sublevel != null
    const db = delegated ? op.sublevel : this[kDb]

    const keyError = db._checkKey(op.key)
    if (keyError != null) throw keyError

    op.keyEncoding = db.keyEncoding(op.keyEncoding)

    if (isPut) {
      const valueError = db._checkValue(op.value)
      if (valueError != null) throw valueError

      op.valueEncoding = db.valueEncoding(op.valueEncoding)
    } else if (op.type !== 'del') {
      throw new TypeError("A batch operation must have a type property that is 'put' or 'del'")
    }

    // Encode data for private API
    const keyEncoding = op.keyEncoding
    const preencodedKey = keyEncoding.encode(op.key)
    const keyFormat = keyEncoding.format
    const encodedKey = delegated ? prefixDescendantKey(preencodedKey, keyFormat, db, this[kDb]) : preencodedKey

    // Prevent double prefixing
    if (delegated) op.sublevel = null

    let publicOperation = null

    if (this[kPublicOperations] !== null) {
      // Clone op before we mutate it for the private API
      publicOperation = Object.assign({}, op)
      publicOperation.encodedKey = encodedKey

      if (delegated) {
        // Ensure emitted data makes sense in the context of this[kDb]
        publicOperation.key = encodedKey
        publicOperation.keyEncoding = this[kDb].keyEncoding(keyFormat)
      }

      this[kPublicOperations].push(publicOperation)
    }

    op.key = this[kDb].prefixKey(encodedKey, keyFormat, true)
    op.keyEncoding = keyFormat

    if (isPut) {
      const valueEncoding = op.valueEncoding
      const encodedValue = valueEncoding.encode(op.value)
      const valueFormat = valueEncoding.format

      op.value = encodedValue
      op.valueEncoding = valueFormat

      if (publicOperation !== null) {
        publicOperation.encodedValue = encodedValue

        if (delegated) {
          publicOperation.value = encodedValue
          publicOperation.valueEncoding = this[kDb].valueEncoding(valueFormat)
        }
      }
    }

    this[kPrivateOperations].push(op)
    return this
  }
}

exports.PrewriteBatch = PrewriteBatch
