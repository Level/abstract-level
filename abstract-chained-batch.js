'use strict'

const combineErrors = require('maybe-combine-errors')
const ModuleError = require('module-error')
const { getOptions, emptyOptions, noop } = require('./lib/common')
const { prefixDescendantKey, isDescendant } = require('./lib/prefixes')
const { PrewriteBatch } = require('./lib/prewrite-batch')

const kPublicOperations = Symbol('publicOperations')
const kPrivateOperations = Symbol('privateOperations')

class AbstractChainedBatch {
  #status = 'open'
  #length = 0
  #closePromise = null
  #publicOperations
  #prewriteRun
  #prewriteBatch
  #prewriteData
  #addMode

  constructor (db, options) {
    if (typeof db !== 'object' || db === null) {
      const hint = db === null ? 'null' : typeof db
      throw new TypeError(`The first argument must be an abstract-level database, received ${hint}`)
    }

    const enableWriteEvent = db.listenerCount('write') > 0
    const enablePrewriteHook = !db.hooks.prewrite.noop

    // Operations for write event. We can skip populating this array (and cloning of
    // operations, which is the expensive part) if there are 0 write event listeners.
    this.#publicOperations = enableWriteEvent ? [] : null

    this.#addMode = getOptions(options, emptyOptions).add === true

    if (enablePrewriteHook) {
      // Use separate arrays to collect operations added by hook functions, because
      // we wait to apply those until write(). Store these arrays in PrewriteData which
      // exists to separate internal data from the public PrewriteBatch interface.
      const data = new PrewriteData([], enableWriteEvent ? [] : null)

      this.#prewriteData = data
      this.#prewriteBatch = new PrewriteBatch(db, data[kPrivateOperations], data[kPublicOperations])
      this.#prewriteRun = db.hooks.prewrite.run // TODO: document why
    } else {
      this.#prewriteData = null
      this.#prewriteBatch = null
      this.#prewriteRun = null
    }

    this.db = db
    this.db.attachResource(this)
  }

  get length () {
    if (this.#prewriteData !== null) {
      return this.#length + this.#prewriteData.length
    } else {
      return this.#length
    }
  }

  put (key, value, options) {
    this.#assertStatus()
    options = getOptions(options, emptyOptions)

    const delegated = options.sublevel != null
    const db = delegated ? options.sublevel : this.db

    db._assertValidKey(key)
    db._assertValidValue(value)

    const op = {
      ...options,
      type: 'put',
      key,
      value,
      keyEncoding: db.keyEncoding(options.keyEncoding),
      valueEncoding: db.valueEncoding(options.valueEncoding)
    }

    if (this.#prewriteRun !== null) {
      try {
        // Note: we could have chosen to recurse here so that prewriteBatch.put() would
        // call this.put(). But then operations added by hook functions would be inserted
        // before rather than after user operations. Instead we process those operations
        // lazily in write(). This does hurt the only performance benefit benefit of a
        // chained batch though, which is that it avoids blocking the event loop with
        // more than one operation at a time. On the other hand, if operations added by
        // hook functions are adjacent (i.e. sorted) committing them should be faster.
        this.#prewriteRun(op, this.#prewriteBatch)

        // Normalize encodings again in case they were modified
        op.keyEncoding = db.keyEncoding(op.keyEncoding)
        op.valueEncoding = db.valueEncoding(op.valueEncoding)
      } catch (err) {
        throw new ModuleError('The prewrite hook failed on batch.put()', {
          code: 'LEVEL_HOOK_ERROR',
          cause: err
        })
      }
    }

    // Encode data for private API
    const keyEncoding = op.keyEncoding
    const preencodedKey = keyEncoding.encode(op.key)
    const keyFormat = keyEncoding.format

    // If the sublevel is not a descendant then forward that option to the parent db
    // so that we don't erroneously add our own prefix to the key of the operation.
    const siblings = delegated && !isDescendant(op.sublevel, this.db) && op.sublevel !== this.db
    const encodedKey = delegated && !siblings
      ? prefixDescendantKey(preencodedKey, keyFormat, db, this.db)
      : preencodedKey

    const valueEncoding = op.valueEncoding
    const encodedValue = valueEncoding.encode(op.value)
    const valueFormat = valueEncoding.format

    // Only prefix once
    if (delegated && !siblings) {
      op.sublevel = null
    }

    // If the sublevel is not a descendant then we shouldn't emit events
    if (this.#publicOperations !== null && !siblings) {
      // Clone op before we mutate it for the private API
      const publicOperation = { ...op }
      publicOperation.encodedKey = encodedKey
      publicOperation.encodedValue = encodedValue

      if (delegated) {
        // Ensure emitted data makes sense in the context of this db
        publicOperation.key = encodedKey
        publicOperation.value = encodedValue
        publicOperation.keyEncoding = this.db.keyEncoding(keyFormat)
        publicOperation.valueEncoding = this.db.valueEncoding(valueFormat)
      }

      this.#publicOperations.push(publicOperation)
    }

    // If we're forwarding the sublevel option then don't prefix the key yet
    op.key = siblings ? encodedKey : this.db.prefixKey(encodedKey, keyFormat, true)
    op.value = encodedValue
    op.keyEncoding = keyFormat
    op.valueEncoding = valueFormat

    if (this.#addMode) {
      this._add(op)
    } else {
      // This "operation as options" trick avoids further cloning
      this._put(op.key, encodedValue, op)
    }

    // Increment only on success
    this.#length++
    return this
  }

  _put (key, value, options) {}

  del (key, options) {
    this.#assertStatus()
    options = getOptions(options, emptyOptions)

    const delegated = options.sublevel != null
    const db = delegated ? options.sublevel : this.db

    db._assertValidKey(key)

    const op = {
      ...options,
      type: 'del',
      key,
      keyEncoding: db.keyEncoding(options.keyEncoding)
    }

    if (this.#prewriteRun !== null) {
      try {
        this.#prewriteRun(op, this.#prewriteBatch)

        // Normalize encoding again in case it was modified
        op.keyEncoding = db.keyEncoding(op.keyEncoding)
      } catch (err) {
        throw new ModuleError('The prewrite hook failed on batch.del()', {
          code: 'LEVEL_HOOK_ERROR',
          cause: err
        })
      }
    }

    // Encode data for private API
    const keyEncoding = op.keyEncoding
    const preencodedKey = keyEncoding.encode(op.key)
    const keyFormat = keyEncoding.format
    const encodedKey = delegated ? prefixDescendantKey(preencodedKey, keyFormat, db, this.db) : preencodedKey

    // Prevent double prefixing
    if (delegated) op.sublevel = null

    if (this.#publicOperations !== null) {
      // Clone op before we mutate it for the private API
      const publicOperation = { ...op }
      publicOperation.encodedKey = encodedKey

      if (delegated) {
        // Ensure emitted data makes sense in the context of this db
        publicOperation.key = encodedKey
        publicOperation.keyEncoding = this.db.keyEncoding(keyFormat)
      }

      this.#publicOperations.push(publicOperation)
    }

    op.key = this.db.prefixKey(encodedKey, keyFormat, true)
    op.keyEncoding = keyFormat

    if (this.#addMode) {
      this._add(op)
    } else {
      // This "operation as options" trick avoids further cloning
      this._del(op.key, op)
    }

    // Increment only on success
    this.#length++
    return this
  }

  _del (key, options) {}

  _add (op) {}

  clear () {
    this.#assertStatus()
    this._clear()

    if (this.#publicOperations !== null) this.#publicOperations = []
    if (this.#prewriteData !== null) this.#prewriteData.clear()

    this.#length = 0
    return this
  }

  _clear () {}

  async write (options) {
    this.#assertStatus()
    options = getOptions(options)

    if (this.#length === 0) {
      return this.close()
    } else {
      this.#status = 'writing'

      // Prepare promise in case close() is called in the mean time
      const close = this.#prepareClose()

      try {
        // Process operations added by prewrite hook functions
        if (this.#prewriteData !== null) {
          const publicOperations = this.#prewriteData[kPublicOperations]
          const privateOperations = this.#prewriteData[kPrivateOperations]
          const length = this.#prewriteData.length

          for (let i = 0; i < length; i++) {
            const op = privateOperations[i]

            // We can _add(), _put() or _del() even though status is now 'writing' because
            // status isn't exposed to the private API, so there's no difference in state
            // from that perspective, unless an implementation overrides the public write()
            // method at its own risk.
            if (this.#addMode) {
              this._add(op)
            } else if (op.type === 'put') {
              this._put(op.key, op.value, op)
            } else {
              this._del(op.key, op)
            }
          }

          if (publicOperations !== null && length !== 0) {
            this.#publicOperations = this.#publicOperations.concat(publicOperations)
          }
        }

        await this._write(options)
      } catch (err) {
        close()

        try {
          await this.#closePromise
        } catch (closeErr) {
          // eslint-disable-next-line no-ex-assign
          err = combineErrors([err, closeErr])
        }

        throw err
      }

      close()

      // Emit after initiating the closing, because event may trigger a
      // db close which in turn triggers (idempotently) closing this batch.
      if (this.#publicOperations !== null) {
        this.db.emit('write', this.#publicOperations)
      }

      return this.#closePromise
    }
  }

  async _write (options) {}

  async close () {
    if (this.#closePromise !== null) {
      // First caller of close() or write() is responsible for error
      return this.#closePromise.catch(noop)
    } else {
      // Wrap promise to avoid race issues on recursive calls
      this.#prepareClose()()
      return this.#closePromise
    }
  }

  async _close () {}

  #assertStatus () {
    if (this.#status !== 'open') {
      throw new ModuleError('Batch is not open: cannot change operations after write() or close()', {
        code: 'LEVEL_BATCH_NOT_OPEN'
      })
    }

    // Can technically be removed, because it's no longer possible to call db.batch() when
    // status is not 'open', and db.close() closes the batch. Keep for now, in case of
    // unforseen userland behaviors.
    if (this.db.status !== 'open') {
      /* istanbul ignore next */
      throw new ModuleError('Database is not open', {
        code: 'LEVEL_DATABASE_NOT_OPEN'
      })
    }
  }

  #prepareClose () {
    let close

    this.#closePromise = new Promise((resolve, reject) => {
      close = () => {
        this.#privateClose().then(resolve, reject)
      }
    })

    return close
  }

  async #privateClose () {
    // TODO: should we not set status earlier?
    this.#status = 'closing'
    await this._close()
    this.db.detachResource(this)
  }
}

if (typeof Symbol.asyncDispose === 'symbol') {
  AbstractChainedBatch.prototype[Symbol.asyncDispose] = async function () {
    return this.close()
  }
}

class PrewriteData {
  constructor (privateOperations, publicOperations) {
    this[kPrivateOperations] = privateOperations
    this[kPublicOperations] = publicOperations
  }

  get length () {
    return this[kPrivateOperations].length
  }

  clear () {
    // Clear operation arrays if present.
    for (const k of [kPublicOperations, kPrivateOperations]) {
      const ops = this[k]

      if (ops !== null) {
        // Keep array alive because PrewriteBatch has a reference to it
        ops.splice(0, ops.length)
      }
    }
  }
}

exports.AbstractChainedBatch = AbstractChainedBatch
