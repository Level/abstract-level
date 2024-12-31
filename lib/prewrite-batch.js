'use strict'

const { prefixDescendantKey, isDescendant } = require('./prefixes')

// An interface for prewrite hook functions to add operations
class PrewriteBatch {
  #db
  #privateOperations
  #publicOperations

  constructor (db, privateOperations, publicOperations) {
    this.#db = db

    // Note: if for db.batch([]), these arrays include input operations (or empty slots
    // for them) but if for chained batch then it does not. Small implementation detail.
    this.#privateOperations = privateOperations
    this.#publicOperations = publicOperations
  }

  add (op) {
    const isPut = op.type === 'put'
    const delegated = op.sublevel != null
    const db = delegated ? op.sublevel : this.#db

    db._assertValidKey(op.key)
    op.keyEncoding = db.keyEncoding(op.keyEncoding)

    if (isPut) {
      db._assertValidValue(op.value)
      op.valueEncoding = db.valueEncoding(op.valueEncoding)
    } else if (op.type !== 'del') {
      throw new TypeError("A batch operation must have a type property that is 'put' or 'del'")
    }

    // Encode data for private API
    const keyEncoding = op.keyEncoding
    const preencodedKey = keyEncoding.encode(op.key)
    const keyFormat = keyEncoding.format

    // If the sublevel is not a descendant then forward that option to the parent db
    // so that we don't erroneously add our own prefix to the key of the operation.
    const siblings = delegated && !isDescendant(op.sublevel, this.#db) && op.sublevel !== this.#db
    const encodedKey = delegated && !siblings
      ? prefixDescendantKey(preencodedKey, keyFormat, db, this.#db)
      : preencodedKey

    // Only prefix once
    if (delegated && !siblings) {
      op.sublevel = null
    }

    let publicOperation = null

    // If the sublevel is not a descendant then we shouldn't emit events
    if (this.#publicOperations !== null && !siblings) {
      // Clone op before we mutate it for the private API
      publicOperation = { ...op }
      publicOperation.encodedKey = encodedKey

      if (delegated) {
        // Ensure emitted data makes sense in the context of this.#db
        publicOperation.key = encodedKey
        publicOperation.keyEncoding = this.#db.keyEncoding(keyFormat)
      }

      this.#publicOperations.push(publicOperation)
    }

    // If we're forwarding the sublevel option then don't prefix the key yet
    op.key = siblings ? encodedKey : this.#db.prefixKey(encodedKey, keyFormat, true)
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
          publicOperation.valueEncoding = this.#db.valueEncoding(valueFormat)
        }
      }
    }

    this.#privateOperations.push(op)
    return this
  }
}

exports.PrewriteBatch = PrewriteBatch
