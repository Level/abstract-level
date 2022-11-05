'use strict'

const { fromCallback } = require('catering')
const ModuleError = require('module-error')
const { getCallback, getOptions, emptyOptions } = require('./lib/common')
const { prefixDescendantKey } = require('./lib/prefixes')
const { PrewriteBatch } = require('./lib/prewrite-batch')

const kPromise = Symbol('promise')
const kStatus = Symbol('status')
const kPublicOperations = Symbol('publicOperations')
const kLegacyOperations = Symbol('legacyOperations')
const kPrivateOperations = Symbol('privateOperations')
const kFinishClose = Symbol('finishClose')
const kCloseCallbacks = Symbol('closeCallbacks')
const kLength = Symbol('length')
const kPrewriteRun = Symbol('prewriteRun')
const kPrewriteBatch = Symbol('prewriteBatch')
const kPrewriteData = Symbol('prewriteData')
const kAddMode = Symbol('addMode')

class AbstractChainedBatch {
  constructor (db, options) {
    if (typeof db !== 'object' || db === null) {
      const hint = db === null ? 'null' : typeof db
      throw new TypeError(`The first argument must be an abstract-level database, received ${hint}`)
    }

    const enableWriteEvent = db.listenerCount('write') > 0
    const enablePrewriteHook = !db.hooks.prewrite.noop

    // Operations for write event. We can skip populating this array (and cloning of
    // operations, which is the expensive part) if there are 0 write event listeners.
    this[kPublicOperations] = enableWriteEvent ? [] : null

    // Operations for legacy batch event. If user opted-in to write event or prewrite
    // hook, skip legacy batch event. We can't skip the batch event based on listener
    // count, because a listener may be added between put() or del() and write().
    this[kLegacyOperations] = enableWriteEvent || enablePrewriteHook ? null : []

    this[kLength] = 0
    this[kCloseCallbacks] = []
    this[kStatus] = 'open'
    this[kFinishClose] = this[kFinishClose].bind(this)
    this[kAddMode] = getOptions(options, emptyOptions).add === true

    if (enablePrewriteHook) {
      // Use separate arrays to collect operations added by hook functions, because
      // we wait to apply those until write(). Store these arrays in PrewriteData which
      // exists to separate internal data from the public PrewriteBatch interface.
      const data = new PrewriteData([], enableWriteEvent ? [] : null)

      this[kPrewriteData] = data
      this[kPrewriteBatch] = new PrewriteBatch(db, data[kPrivateOperations], data[kPublicOperations])
      this[kPrewriteRun] = db.hooks.prewrite.run // TODO: document why
    } else {
      this[kPrewriteData] = null
      this[kPrewriteBatch] = null
      this[kPrewriteRun] = null
    }

    this.db = db
    this.db.attachResource(this)
    this.nextTick = db.nextTick
  }

  get length () {
    if (this[kPrewriteData] !== null) {
      return this[kLength] + this[kPrewriteData].length
    } else {
      return this[kLength]
    }
  }

  put (key, value, options) {
    assertStatus(this)
    options = getOptions(options, emptyOptions)

    const delegated = options.sublevel != null
    const db = delegated ? options.sublevel : this.db
    const original = options
    const keyError = db._checkKey(key)
    const valueError = db._checkValue(value)

    if (keyError != null) throw keyError
    if (valueError != null) throw valueError

    // Avoid spread operator because of https://bugs.chromium.org/p/chromium/issues/detail?id=1204540
    const op = Object.assign({}, options, {
      type: 'put',
      key,
      value,
      keyEncoding: db.keyEncoding(options.keyEncoding),
      valueEncoding: db.valueEncoding(options.valueEncoding)
    })

    if (this[kPrewriteRun] !== null) {
      try {
        // Note: we could have chosen to recurse here so that prewriteBatch.put() would
        // call this.put(). But then operations added by hook functions would be inserted
        // before rather than after user operations. Instead we process those operations
        // lazily in write(). This does hurt the only performance benefit benefit of a
        // chained batch though, which is that it avoids blocking the event loop with
        // more than one operation at a time. On the other hand, if operations added by
        // hook functions are adjacent (i.e. sorted) committing them should be faster.
        this[kPrewriteRun](op, this[kPrewriteBatch])

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
    const encodedKey = delegated ? prefixDescendantKey(preencodedKey, keyFormat, db, this.db) : preencodedKey
    const valueEncoding = op.valueEncoding
    const encodedValue = valueEncoding.encode(op.value)
    const valueFormat = valueEncoding.format

    // Prevent double prefixing
    if (delegated) op.sublevel = null

    if (this[kPublicOperations] !== null) {
      // Clone op before we mutate it for the private API
      const publicOperation = Object.assign({}, op)
      publicOperation.encodedKey = encodedKey
      publicOperation.encodedValue = encodedValue

      if (delegated) {
        // Ensure emitted data makes sense in the context of this db
        publicOperation.key = encodedKey
        publicOperation.value = encodedValue
        publicOperation.keyEncoding = this.db.keyEncoding(keyFormat)
        publicOperation.valueEncoding = this.db.valueEncoding(valueFormat)
      }

      this[kPublicOperations].push(publicOperation)
    } else if (this[kLegacyOperations] !== null) {
      const legacyOperation = Object.assign({}, original)

      legacyOperation.type = 'put'
      legacyOperation.key = key
      legacyOperation.value = value

      this[kLegacyOperations].push(legacyOperation)
    }

    op.key = this.db.prefixKey(encodedKey, keyFormat, true)
    op.value = encodedValue
    op.keyEncoding = keyFormat
    op.valueEncoding = valueFormat

    if (this[kAddMode]) {
      this._add(op)
    } else {
      // This "operation as options" trick avoids further cloning
      this._put(op.key, encodedValue, op)
    }

    // Increment only on success
    this[kLength]++
    return this
  }

  _put (key, value, options) {}

  del (key, options) {
    assertStatus(this)
    options = getOptions(options, emptyOptions)

    const delegated = options.sublevel != null
    const db = delegated ? options.sublevel : this.db
    const original = options
    const keyError = db._checkKey(key)

    if (keyError != null) throw keyError

    // Avoid spread operator because of https://bugs.chromium.org/p/chromium/issues/detail?id=1204540
    const op = Object.assign({}, options, {
      type: 'del',
      key,
      keyEncoding: db.keyEncoding(options.keyEncoding)
    })

    if (this[kPrewriteRun] !== null) {
      try {
        this[kPrewriteRun](op, this[kPrewriteBatch])

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

    if (this[kPublicOperations] !== null) {
      // Clone op before we mutate it for the private API
      const publicOperation = Object.assign({}, op)
      publicOperation.encodedKey = encodedKey

      if (delegated) {
        // Ensure emitted data makes sense in the context of this db
        publicOperation.key = encodedKey
        publicOperation.keyEncoding = this.db.keyEncoding(keyFormat)
      }

      this[kPublicOperations].push(publicOperation)
    } else if (this[kLegacyOperations] !== null) {
      const legacyOperation = Object.assign({}, original)

      legacyOperation.type = 'del'
      legacyOperation.key = key

      this[kLegacyOperations].push(legacyOperation)
    }

    op.key = this.db.prefixKey(encodedKey, keyFormat, true)
    op.keyEncoding = keyFormat

    if (this[kAddMode]) {
      this._add(op)
    } else {
      // This "operation as options" trick avoids further cloning
      this._del(op.key, op)
    }

    // Increment only on success
    this[kLength]++
    return this
  }

  _del (key, options) {}

  // TODO: docs
  _add (op) {}

  clear () {
    assertStatus(this)
    this._clear()

    if (this[kPublicOperations] !== null) this[kPublicOperations] = []
    if (this[kLegacyOperations] !== null) this[kLegacyOperations] = []
    if (this[kPrewriteData] !== null) this[kPrewriteData].clear()

    this[kLength] = 0
    return this
  }

  _clear () {}

  write (options, callback) {
    callback = getCallback(options, callback)
    callback = fromCallback(callback, kPromise)
    options = getOptions(options)

    if (this[kStatus] !== 'open') {
      this.nextTick(callback, new ModuleError('Batch is not open: cannot call write() after write() or close()', {
        code: 'LEVEL_BATCH_NOT_OPEN'
      }))
    } else if (this[kLength] === 0) {
      this.close(callback)
    } else {
      this[kStatus] = 'writing'

      // Process operations added by prewrite hook functions
      if (this[kPrewriteData] !== null) {
        const publicOperations = this[kPrewriteData][kPublicOperations]
        const privateOperations = this[kPrewriteData][kPrivateOperations]
        const length = this[kPrewriteData].length

        for (let i = 0; i < length; i++) {
          const op = privateOperations[i]

          // We can _add(), _put() or _del() even though status is now 'writing' because
          // status isn't exposed to the private API, so there's no difference in state
          // from that perspective, unless an implementation overrides the public write()
          // method at its own risk.
          if (this[kAddMode]) {
            this._add(op)
          } else if (op.type === 'put') {
            this._put(op.key, op.value, op)
          } else {
            this._del(op.key, op)
          }
        }

        if (publicOperations !== null && length !== 0) {
          this[kPublicOperations] = this[kPublicOperations].concat(publicOperations)
        }
      }

      this._write(options, (err) => {
        this[kStatus] = 'closing'
        this[kCloseCallbacks].push(() => callback(err))

        // Emit after setting 'closing' status, because event may trigger a
        // db close which in turn triggers (idempotently) closing this batch.
        if (!err) {
          if (this[kPublicOperations] !== null) {
            this.db.emit('write', this[kPublicOperations])
          } else if (this[kLegacyOperations] !== null) {
            this.db.emit('batch', this[kLegacyOperations])
          }
        }

        this._close(this[kFinishClose])
      })
    }

    return callback[kPromise]
  }

  _write (options, callback) {}

  close (callback) {
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

  _close (callback) {
    this.nextTick(callback)
  }

  [kFinishClose] () {
    this[kStatus] = 'closed'
    this.db.detachResource(this)

    const callbacks = this[kCloseCallbacks]
    this[kCloseCallbacks] = []

    for (const cb of callbacks) {
      cb()
    }
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

function assertStatus (batch) {
  if (batch[kStatus] !== 'open') {
    throw new ModuleError('Batch is not open: cannot change operations after write() or close()', {
      code: 'LEVEL_BATCH_NOT_OPEN'
    })
  }

  // TODO (next major): enforce this regardless of hooks
  if (batch[kPrewriteBatch] !== null && batch.db.status !== 'open') {
    throw new ModuleError('Chained batch is not available until database is open', {
      code: 'LEVEL_DATABASE_NOT_OPEN'
    })
  }
}

exports.AbstractChainedBatch = AbstractChainedBatch
