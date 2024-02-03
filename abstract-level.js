'use strict'

const { supports } = require('level-supports')
const { Transcoder } = require('level-transcoder')
const { EventEmitter } = require('events')
const ModuleError = require('module-error')
const combineErrors = require('maybe-combine-errors')
const { AbstractIterator } = require('./abstract-iterator')
const { DefaultKeyIterator, DefaultValueIterator } = require('./lib/default-kv-iterator')
const { DeferredIterator, DeferredKeyIterator, DeferredValueIterator } = require('./lib/deferred-iterator')
const { DefaultChainedBatch } = require('./lib/default-chained-batch')
const { DatabaseHooks } = require('./lib/hooks')
const { PrewriteBatch } = require('./lib/prewrite-batch')
const { EventMonitor } = require('./lib/event-monitor')
const { getOptions, noop, emptyOptions, resolvedPromise } = require('./lib/common')
const { prefixDescendantKey, isDescendant } = require('./lib/prefixes')
const { DeferredQueue } = require('./lib/deferred-queue')
const rangeOptions = require('./lib/range-options')

const kResources = Symbol('resources')
const kCloseResources = Symbol('closeResources')
const kQueue = Symbol('queue')
const kDeferOpen = Symbol('deferOpen')
const kOptions = Symbol('options')
const kStatus = Symbol('status')
const kStatusChange = Symbol('statusChange')
const kStatusLocked = Symbol('statusLocked')
const kDefaultOptions = Symbol('defaultOptions')
const kTranscoder = Symbol('transcoder')
const kKeyEncoding = Symbol('keyEncoding')
const kValueEncoding = Symbol('valueEncoding')
const kEventMonitor = Symbol('eventMonitor')
const kArrayBatch = Symbol('arrayBatch')

class AbstractLevel extends EventEmitter {
  constructor (manifest, options) {
    super()

    if (typeof manifest !== 'object' || manifest === null) {
      throw new TypeError("The first argument 'manifest' must be an object")
    }

    options = getOptions(options)
    const { keyEncoding, valueEncoding, passive, ...forward } = options

    this[kResources] = new Set()
    this[kQueue] = new DeferredQueue()
    this[kDeferOpen] = true
    this[kOptions] = forward
    this[kStatus] = 'opening'
    this[kStatusChange] = null
    this[kStatusLocked] = false

    this.hooks = new DatabaseHooks()
    this.supports = supports(manifest, {
      deferredOpen: true,

      // TODO (next major): add seek
      snapshots: manifest.snapshots !== false,
      permanence: manifest.permanence !== false,

      encodings: manifest.encodings || {},
      events: Object.assign({}, manifest.events, {
        opening: true,
        open: true,
        closing: true,
        closed: true,
        write: true,
        put: true,
        del: true,
        batch: true,
        clear: true
      })
    })

    // Monitor event listeners
    this[kEventMonitor] = new EventMonitor(this, [
      { name: 'write' },
      { name: 'put', deprecated: true, alt: 'write' },
      { name: 'del', deprecated: true, alt: 'write' },
      { name: 'batch', deprecated: true, alt: 'write' }
    ])

    this[kTranscoder] = new Transcoder(formats(this))
    this[kKeyEncoding] = this[kTranscoder].encoding(keyEncoding || 'utf8')
    this[kValueEncoding] = this[kTranscoder].encoding(valueEncoding || 'utf8')

    // Add custom and transcoder encodings to manifest
    for (const encoding of this[kTranscoder].encodings()) {
      if (!this.supports.encodings[encoding.commonName]) {
        this.supports.encodings[encoding.commonName] = true
      }
    }

    this[kDefaultOptions] = {
      empty: emptyOptions,
      entry: Object.freeze({
        keyEncoding: this[kKeyEncoding].commonName,
        valueEncoding: this[kValueEncoding].commonName
      }),
      entryFormat: Object.freeze({
        keyEncoding: this[kKeyEncoding].format,
        valueEncoding: this[kValueEncoding].format
      }),
      key: Object.freeze({
        keyEncoding: this[kKeyEncoding].commonName
      }),
      keyFormat: Object.freeze({
        keyEncoding: this[kKeyEncoding].format
      })
    }

    // Before we start opening, let subclass finish its constructor
    // and allow events and postopen hook functions to be added.
    queueMicrotask(() => {
      if (this[kDeferOpen]) {
        this.open({ passive: false }).catch(noop)
      }
    })
  }

  get status () {
    return this[kStatus]
  }

  get parent () {
    return null
  }

  keyEncoding (encoding) {
    return this[kTranscoder].encoding(encoding != null ? encoding : this[kKeyEncoding])
  }

  valueEncoding (encoding) {
    return this[kTranscoder].encoding(encoding != null ? encoding : this[kValueEncoding])
  }

  async open (options) {
    options = { ...this[kOptions], ...getOptions(options) }

    options.createIfMissing = options.createIfMissing !== false
    options.errorIfExists = !!options.errorIfExists

    // TODO: document why we do this
    const postopen = this.hooks.postopen.noop ? null : this.hooks.postopen.run
    const passive = options.passive

    if (passive && this[kDeferOpen]) {
      // Wait a tick until constructor calls open() non-passively
      await undefined
    }

    // Wait for pending changes and check that opening is allowed
    assertUnlocked(this)
    while (this[kStatusChange] !== null) await this[kStatusChange].catch(noop)
    assertUnlocked(this)

    if (passive) {
      if (this[kStatus] !== 'open') throw new NotOpenError()
    } else if (this[kStatus] === 'closed' || this[kDeferOpen]) {
      this[kDeferOpen] = false
      this[kStatusChange] = resolvedPromise // TODO: refactor
      this[kStatusChange] = (async () => {
        this[kStatus] = 'opening'

        try {
          this.emit('opening')
          await this._open(options)
        } catch (err) {
          this[kStatus] = 'closed'

          // Must happen before we close resources, in case their close() is waiting
          // on a deferred operation which in turn is waiting on db.open().
          this[kQueue].drain()

          try {
            await this[kCloseResources]()
          } catch (resourceErr) {
            // eslint-disable-next-line no-ex-assign
            err = combineErrors([err, resourceErr])
          }

          throw new NotOpenError(err)
        }

        this[kStatus] = 'open'

        if (postopen !== null) {
          let hookErr

          try {
            // Prevent deadlock
            this[kStatusLocked] = true
            await postopen(options)
          } catch (err) {
            hookErr = convertRejection(err)
          } finally {
            this[kStatusLocked] = false
          }

          // Revert
          if (hookErr) {
            this[kStatus] = 'closing'
            this[kQueue].drain()

            try {
              await this[kCloseResources]()
              await this._close()
            } catch (closeErr) {
              // There's no safe state to return to. Can't return to 'open' because
              // postopen hook failed. Can't return to 'closed' (with the ability to
              // reopen) because the underlying database is potentially still open.
              this[kStatusLocked] = true
              hookErr = combineErrors([hookErr, closeErr])
            }

            this[kStatus] = 'closed'

            throw new ModuleError('The postopen hook failed on open()', {
              code: 'LEVEL_HOOK_ERROR',
              cause: hookErr
            })
          }
        }

        this[kQueue].drain()
        this.emit('open')
      })()

      try {
        await this[kStatusChange]
      } finally {
        this[kStatusChange] = null
      }
    } else if (this[kStatus] !== 'open') {
      /* istanbul ignore next: should not happen */
      throw new NotOpenError()
    }
  }

  async _open (options) {}

  async close () {
    // Wait for pending changes and check that closing is allowed
    assertUnlocked(this)
    while (this[kStatusChange] !== null) await this[kStatusChange].catch(noop)
    assertUnlocked(this)

    if (this[kStatus] === 'open' || this[kDeferOpen]) {
      // If close() was called after constructor, we didn't open yet
      const fromInitial = this[kDeferOpen]

      this[kDeferOpen] = false
      this[kStatusChange] = resolvedPromise
      this[kStatusChange] = (async () => {
        this[kStatus] = 'closing'
        this[kQueue].drain()

        try {
          this.emit('closing')
          await this[kCloseResources]()
          if (!fromInitial) await this._close()
        } catch (err) {
          this[kStatus] = 'open'
          this[kQueue].drain()
          throw new NotClosedError(err)
        }

        this[kStatus] = 'closed'
        this[kQueue].drain()
        this.emit('closed')
      })()

      try {
        await this[kStatusChange]
      } finally {
        this[kStatusChange] = null
      }
    } else if (this[kStatus] !== 'closed') {
      /* istanbul ignore next: should not happen */
      throw new NotClosedError()
    }
  }

  async [kCloseResources] () {
    if (this[kResources].size === 0) {
      return
    }

    // In parallel so that all resources know they are closed
    const resources = Array.from(this[kResources])
    const promises = resources.map(closeResource)

    // TODO: async/await
    return Promise.allSettled(promises).then(async (results) => {
      const errors = []

      for (let i = 0; i < results.length; i++) {
        if (results[i].status === 'fulfilled') {
          this[kResources].delete(resources[i])
        } else {
          errors.push(convertRejection(results[i].reason))
        }
      }

      if (errors.length > 0) {
        throw combineErrors(errors)
      }
    })
  }

  async _close () {}

  async get (key, options) {
    options = getOptions(options, this[kDefaultOptions].entry)

    if (this[kStatus] === 'opening') {
      return this.deferAsync(() => this.get(key, options))
    }

    assertOpen(this)

    const err = this._checkKey(key)
    if (err) throw err

    const keyEncoding = this.keyEncoding(options.keyEncoding)
    const valueEncoding = this.valueEncoding(options.valueEncoding)
    const keyFormat = keyEncoding.format
    const valueFormat = valueEncoding.format

    // Forward encoding options to the underlying store
    if (options.keyEncoding !== keyFormat || options.valueEncoding !== valueFormat) {
      // Avoid spread operator because of https://bugs.chromium.org/p/chromium/issues/detail?id=1204540
      options = Object.assign({}, options, { keyEncoding: keyFormat, valueEncoding: valueFormat })
    }

    const encodedKey = keyEncoding.encode(key)
    const value = await this._get(this.prefixKey(encodedKey, keyFormat, true), options)

    try {
      return value === undefined ? value : valueEncoding.decode(value)
    } catch (err) {
      throw new ModuleError('Could not decode value', {
        code: 'LEVEL_DECODE_ERROR',
        cause: err
      })
    }
  }

  async _get (key, options) {
    return undefined
  }

  async getMany (keys, options) {
    options = getOptions(options, this[kDefaultOptions].entry)

    if (this[kStatus] === 'opening') {
      return this.deferAsync(() => this.getMany(keys, options))
    }

    assertOpen(this)

    if (!Array.isArray(keys)) {
      throw new TypeError("The first argument 'keys' must be an array")
    }

    if (keys.length === 0) {
      return []
    }

    const keyEncoding = this.keyEncoding(options.keyEncoding)
    const valueEncoding = this.valueEncoding(options.valueEncoding)
    const keyFormat = keyEncoding.format
    const valueFormat = valueEncoding.format

    // Forward encoding options
    if (options.keyEncoding !== keyFormat || options.valueEncoding !== valueFormat) {
      options = Object.assign({}, options, { keyEncoding: keyFormat, valueEncoding: valueFormat })
    }

    const mappedKeys = new Array(keys.length)

    for (let i = 0; i < keys.length; i++) {
      const key = keys[i]
      const err = this._checkKey(key)
      if (err) throw err

      mappedKeys[i] = this.prefixKey(keyEncoding.encode(key), keyFormat, true)
    }

    const values = await this._getMany(mappedKeys, options)

    try {
      for (let i = 0; i < values.length; i++) {
        if (values[i] !== undefined) {
          values[i] = valueEncoding.decode(values[i])
        }
      }
    } catch (err) {
      throw new ModuleError(`Could not decode one or more of ${values.length} value(s)`, {
        code: 'LEVEL_DECODE_ERROR',
        cause: err
      })
    }

    return values
  }

  async _getMany (keys, options) {
    return new Array(keys.length).fill(undefined)
  }

  async put (key, value, options) {
    if (!this.hooks.prewrite.noop) {
      // Forward to batch() which will run the hook
      // Note: technically means that put() supports the sublevel option in this case,
      // but it generally doesn't per documentation (which makes sense). Same for del().
      return this.batch([{ type: 'put', key, value }], options)
    }

    options = getOptions(options, this[kDefaultOptions].entry)

    if (this[kStatus] === 'opening') {
      return this.deferAsync(() => this.put(key, value, options))
    }

    assertOpen(this)

    const err = this._checkKey(key) || this._checkValue(value)
    if (err) throw err

    // Encode data for private API
    const keyEncoding = this.keyEncoding(options.keyEncoding)
    const valueEncoding = this.valueEncoding(options.valueEncoding)
    const keyFormat = keyEncoding.format
    const valueFormat = valueEncoding.format
    const enableWriteEvent = this[kEventMonitor].write
    const original = options

    // Avoid Object.assign() for default options
    // TODO: also apply this tweak to get() and getMany()
    if (options === this[kDefaultOptions].entry) {
      options = this[kDefaultOptions].entryFormat
    } else if (options.keyEncoding !== keyFormat || options.valueEncoding !== valueFormat) {
      options = Object.assign({}, options, { keyEncoding: keyFormat, valueEncoding: valueFormat })
    }

    const encodedKey = keyEncoding.encode(key)
    const prefixedKey = this.prefixKey(encodedKey, keyFormat, true)
    const encodedValue = valueEncoding.encode(value)

    await this._put(prefixedKey, encodedValue, options)

    if (enableWriteEvent) {
      const op = Object.assign({}, original, {
        type: 'put',
        key,
        value,
        keyEncoding,
        valueEncoding,
        encodedKey,
        encodedValue
      })

      this.emit('write', [op])
    } else {
      // TODO (semver-major): remove
      this.emit('put', key, value)
    }
  }

  async _put (key, value, options) {}

  async del (key, options) {
    if (!this.hooks.prewrite.noop) {
      // Forward to batch() which will run the hook
      return this.batch([{ type: 'del', key }], options)
    }

    options = getOptions(options, this[kDefaultOptions].key)

    if (this[kStatus] === 'opening') {
      return this.deferAsync(() => this.del(key, options))
    }

    assertOpen(this)

    const err = this._checkKey(key)
    if (err) throw err

    // Encode data for private API
    const keyEncoding = this.keyEncoding(options.keyEncoding)
    const keyFormat = keyEncoding.format
    const enableWriteEvent = this[kEventMonitor].write
    const original = options

    // Avoid Object.assign() for default options
    if (options === this[kDefaultOptions].key) {
      options = this[kDefaultOptions].keyFormat
    } else if (options.keyEncoding !== keyFormat) {
      options = Object.assign({}, options, { keyEncoding: keyFormat })
    }

    const encodedKey = keyEncoding.encode(key)
    const prefixedKey = this.prefixKey(encodedKey, keyFormat, true)

    await this._del(prefixedKey, options)

    if (enableWriteEvent) {
      const op = Object.assign({}, original, {
        type: 'del',
        key,
        keyEncoding,
        encodedKey
      })

      this.emit('write', [op])
    } else {
      // TODO (semver-major): remove
      this.emit('del', key)
    }
  }

  async _del (key, options) {}

  // TODO (future): add way for implementations to declare which options are for the
  // whole batch rather than defaults for individual operations. E.g. the sync option
  // of classic-level, that should not be copied to individual operations.
  batch (operations, options) {
    if (!arguments.length) {
      assertOpen(this)
      return this._chainedBatch()
    }

    options = getOptions(options, this[kDefaultOptions].empty)
    return this[kArrayBatch](operations, options)
  }

  // Wrapped for async error handling
  async [kArrayBatch] (operations, options) {
    // TODO (not urgent): freeze prewrite hook and write event
    if (this[kStatus] === 'opening') {
      return this.deferAsync(() => this[kArrayBatch](operations, options))
    }

    assertOpen(this)

    if (!Array.isArray(operations)) {
      throw new TypeError("The first argument 'operations' must be an array")
    }

    if (operations.length === 0) {
      return
    }

    const length = operations.length
    const enablePrewriteHook = !this.hooks.prewrite.noop
    const enableWriteEvent = this[kEventMonitor].write
    const publicOperations = enableWriteEvent ? new Array(length) : null
    const privateOperations = new Array(length)
    const prewriteBatch = enablePrewriteHook
      ? new PrewriteBatch(this, privateOperations, publicOperations)
      : null

    for (let i = 0; i < length; i++) {
      // Clone the op so that we can freely mutate it. We can't use a class because the
      // op can have userland properties that we'd have to copy, negating the performance
      // benefits of a class. So use a plain object.
      const op = Object.assign({}, options, operations[i])

      // Hook functions can modify op but not its type or sublevel, so cache those
      const isPut = op.type === 'put'
      const delegated = op.sublevel != null
      const db = delegated ? op.sublevel : this

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

      if (enablePrewriteHook) {
        try {
          this.hooks.prewrite.run(op, prewriteBatch)

          // Normalize encodings again in case they were modified
          op.keyEncoding = db.keyEncoding(op.keyEncoding)
          if (isPut) op.valueEncoding = db.valueEncoding(op.valueEncoding)
        } catch (err) {
          throw new ModuleError('The prewrite hook failed on batch()', {
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
      const siblings = delegated && !isDescendant(op.sublevel, this) && op.sublevel !== this
      const encodedKey = delegated && !siblings
        ? prefixDescendantKey(preencodedKey, keyFormat, db, this)
        : preencodedKey

      // Only prefix once
      if (delegated && !siblings) {
        op.sublevel = null
      }

      let publicOperation = null

      // If the sublevel is not a descendant then we shouldn't emit events
      if (enableWriteEvent && !siblings) {
        // Clone op before we mutate it for the private API
        // TODO (future semver-major): consider sending this shape to private API too
        publicOperation = Object.assign({}, op)
        publicOperation.encodedKey = encodedKey

        if (delegated) {
          // Ensure emitted data makes sense in the context of this db
          publicOperation.key = encodedKey
          publicOperation.keyEncoding = this.keyEncoding(keyFormat)
        }

        publicOperations[i] = publicOperation
      }

      // If we're forwarding the sublevel option then don't prefix the key yet
      op.key = siblings ? encodedKey : this.prefixKey(encodedKey, keyFormat, true)
      op.keyEncoding = keyFormat

      if (isPut) {
        const valueEncoding = op.valueEncoding
        const encodedValue = valueEncoding.encode(op.value)
        const valueFormat = valueEncoding.format

        op.value = encodedValue
        op.valueEncoding = valueFormat

        if (enableWriteEvent && !siblings) {
          publicOperation.encodedValue = encodedValue

          if (delegated) {
            publicOperation.value = encodedValue
            publicOperation.valueEncoding = this.valueEncoding(valueFormat)
          }
        }
      }

      privateOperations[i] = op
    }

    // TODO (future): maybe add separate hook to run on private data. Currently can't work
    // because prefixing happens too soon; we need to move that logic to the private
    // API of AbstractSublevel (or reimplement with hooks). TBD how it'd work in chained
    // batch. Hook would look something like hooks.midwrite.run(privateOperations, ...).

    await this._batch(privateOperations, options)

    if (enableWriteEvent) {
      this.emit('write', publicOperations)
    } else if (!enablePrewriteHook) {
      // TODO (semver-major): remove
      this.emit('batch', operations)
    }
  }

  async _batch (operations, options) {}

  sublevel (name, options) {
    const xopts = AbstractSublevel.defaults(options)
    const sublevel = this._sublevel(name, xopts)

    if (!this.hooks.newsub.noop) {
      try {
        this.hooks.newsub.run(sublevel, xopts)
      } catch (err) {
        throw new ModuleError('The newsub hook failed on sublevel()', {
          code: 'LEVEL_HOOK_ERROR',
          cause: err
        })
      }
    }

    return sublevel
  }

  _sublevel (name, options) {
    return new AbstractSublevel(this, name, options)
  }

  prefixKey (key, keyFormat, local) {
    return key
  }

  async clear (options) {
    options = getOptions(options, this[kDefaultOptions].empty)

    if (this[kStatus] === 'opening') {
      return this.deferAsync(() => this.clear(options))
    }

    assertOpen(this)

    const original = options
    const keyEncoding = this.keyEncoding(options.keyEncoding)

    options = rangeOptions(options, keyEncoding)
    options.keyEncoding = keyEncoding.format

    if (options.limit !== 0) {
      await this._clear(options)
      this.emit('clear', original)
    }
  }

  async _clear (options) {}

  iterator (options) {
    const keyEncoding = this.keyEncoding(options && options.keyEncoding)
    const valueEncoding = this.valueEncoding(options && options.valueEncoding)

    options = rangeOptions(options, keyEncoding)
    options.keys = options.keys !== false
    options.values = options.values !== false

    // We need the original encoding options in AbstractIterator in order to decode data
    options[AbstractIterator.keyEncoding] = keyEncoding
    options[AbstractIterator.valueEncoding] = valueEncoding

    // Forward encoding options to private API
    options.keyEncoding = keyEncoding.format
    options.valueEncoding = valueEncoding.format

    if (this[kStatus] === 'opening') {
      return new DeferredIterator(this, options)
    }

    assertOpen(this)
    return this._iterator(options)
  }

  _iterator (options) {
    return new AbstractIterator(this, options)
  }

  keys (options) {
    // Also include valueEncoding (though unused) because we may fallback to _iterator()
    const keyEncoding = this.keyEncoding(options && options.keyEncoding)
    const valueEncoding = this.valueEncoding(options && options.valueEncoding)

    options = rangeOptions(options, keyEncoding)

    // We need the original encoding options in AbstractKeyIterator in order to decode data
    options[AbstractIterator.keyEncoding] = keyEncoding
    options[AbstractIterator.valueEncoding] = valueEncoding

    // Forward encoding options to private API
    options.keyEncoding = keyEncoding.format
    options.valueEncoding = valueEncoding.format

    if (this[kStatus] === 'opening') {
      return new DeferredKeyIterator(this, options)
    }

    assertOpen(this)
    return this._keys(options)
  }

  _keys (options) {
    return new DefaultKeyIterator(this, options)
  }

  values (options) {
    const keyEncoding = this.keyEncoding(options && options.keyEncoding)
    const valueEncoding = this.valueEncoding(options && options.valueEncoding)

    options = rangeOptions(options, keyEncoding)

    // We need the original encoding options in AbstractValueIterator in order to decode data
    options[AbstractIterator.keyEncoding] = keyEncoding
    options[AbstractIterator.valueEncoding] = valueEncoding

    // Forward encoding options to private API
    options.keyEncoding = keyEncoding.format
    options.valueEncoding = valueEncoding.format

    if (this[kStatus] === 'opening') {
      return new DeferredValueIterator(this, options)
    }

    assertOpen(this)
    return this._values(options)
  }

  _values (options) {
    return new DefaultValueIterator(this, options)
  }

  defer (fn, options) {
    if (typeof fn !== 'function') {
      throw new TypeError('The first argument must be a function')
    }

    this[kQueue].add(function (abortError) {
      if (!abortError) fn()
    }, options)
  }

  deferAsync (fn, options) {
    if (typeof fn !== 'function') {
      throw new TypeError('The first argument must be a function')
    }

    return new Promise((resolve, reject) => {
      this[kQueue].add(function (abortError) {
        if (abortError) reject(abortError)
        else fn().then(resolve, reject)
      }, options)
    })
  }

  // TODO: docs and types
  attachResource (resource) {
    if (typeof resource !== 'object' || resource === null ||
      typeof resource.close !== 'function') {
      throw new TypeError('The first argument must be a resource object')
    }

    this[kResources].add(resource)
  }

  // TODO: docs and types
  detachResource (resource) {
    this[kResources].delete(resource)
  }

  _chainedBatch () {
    return new DefaultChainedBatch(this)
  }

  _checkKey (key) {
    if (key === null || key === undefined) {
      return new ModuleError('Key cannot be null or undefined', {
        code: 'LEVEL_INVALID_KEY'
      })
    }
  }

  _checkValue (value) {
    if (value === null || value === undefined) {
      return new ModuleError('Value cannot be null or undefined', {
        code: 'LEVEL_INVALID_VALUE'
      })
    }
  }
}

const { AbstractSublevel } = require('./lib/abstract-sublevel')({ AbstractLevel })

exports.AbstractLevel = AbstractLevel
exports.AbstractSublevel = AbstractSublevel

const assertOpen = function (db) {
  if (db[kStatus] !== 'open') {
    throw new ModuleError('Database is not open', {
      code: 'LEVEL_DATABASE_NOT_OPEN'
    })
  }
}

const assertUnlocked = function (db) {
  if (db[kStatusLocked]) {
    throw new ModuleError('Database status is locked', {
      code: 'LEVEL_STATUS_LOCKED'
    })
  }
}

const formats = function (db) {
  return Object.keys(db.supports.encodings)
    .filter(k => !!db.supports.encodings[k])
}

const closeResource = function (resource) {
  return resource.close()
}

// Ensure that we don't work with falsy err values, because JavaScript unfortunately
// allows Promise.reject(null) and similar patterns. Which'd break `if (err)` logic.
const convertRejection = function (reason) {
  if (reason instanceof Error) {
    return reason
  }

  if (Object.prototype.toString.call(reason) === '[object Error]') {
    return reason
  }

  const hint = reason === null ? 'null' : typeof reason
  const msg = `Promise rejection reason must be an Error, received ${hint}`

  return new TypeError(msg)
}

// Internal utilities, not typed or exported
class NotOpenError extends ModuleError {
  constructor (cause) {
    super('Database failed to open', {
      code: 'LEVEL_DATABASE_NOT_OPEN',
      cause
    })
  }
}

class NotClosedError extends ModuleError {
  constructor (cause) {
    super('Database failed to close', {
      code: 'LEVEL_DATABASE_NOT_CLOSED',
      cause
    })
  }
}
