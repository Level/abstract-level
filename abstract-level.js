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

class AbstractLevel extends EventEmitter {
  #status = 'opening'
  #deferOpen = true
  #statusChange = null
  #statusLocked = false
  #resources
  #queue
  #options
  #defaultOptions
  #transcoder
  #keyEncoding
  #valueEncoding
  #eventMonitor

  constructor (manifest, options) {
    super()

    if (typeof manifest !== 'object' || manifest === null) {
      throw new TypeError("The first argument 'manifest' must be an object")
    }

    options = getOptions(options)
    const { keyEncoding, valueEncoding, passive, ...forward } = options

    this.#resources = new Set()
    this.#queue = new DeferredQueue()
    this.#options = forward

    // Aliased for backwards compatibility
    const implicitSnapshots = manifest.snapshots !== false &&
      manifest.implicitSnapshots !== false

    this.hooks = new DatabaseHooks()
    this.supports = supports(manifest, {
      deferredOpen: true,
      seek: true,
      implicitSnapshots,
      permanence: manifest.permanence !== false,

      encodings: manifest.encodings || {},
      events: {
        ...manifest.events,
        opening: true,
        open: true,
        closing: true,
        closed: true,
        write: true,
        clear: true
      }
    })

    this.#eventMonitor = new EventMonitor(this)
    this.#transcoder = new Transcoder(formats(this))
    this.#keyEncoding = this.#transcoder.encoding(keyEncoding || 'utf8')
    this.#valueEncoding = this.#transcoder.encoding(valueEncoding || 'utf8')

    // Add custom and transcoder encodings to manifest
    for (const encoding of this.#transcoder.encodings()) {
      if (!this.supports.encodings[encoding.commonName]) {
        this.supports.encodings[encoding.commonName] = true
      }
    }

    this.#defaultOptions = {
      empty: emptyOptions,
      entry: Object.freeze({
        keyEncoding: this.#keyEncoding.commonName,
        valueEncoding: this.#valueEncoding.commonName
      }),
      entryFormat: Object.freeze({
        keyEncoding: this.#keyEncoding.format,
        valueEncoding: this.#valueEncoding.format
      }),
      key: Object.freeze({
        keyEncoding: this.#keyEncoding.commonName
      }),
      keyFormat: Object.freeze({
        keyEncoding: this.#keyEncoding.format
      }),
      owner: Object.freeze({
        owner: this
      })
    }

    // Before we start opening, let subclass finish its constructor
    // and allow events and postopen hook functions to be added.
    queueMicrotask(() => {
      if (this.#deferOpen) {
        this.open({ passive: false }).catch(noop)
      }
    })
  }

  get status () {
    return this.#status
  }

  get parent () {
    return null
  }

  keyEncoding (encoding) {
    return this.#transcoder.encoding(encoding ?? this.#keyEncoding)
  }

  valueEncoding (encoding) {
    return this.#transcoder.encoding(encoding ?? this.#valueEncoding)
  }

  async open (options) {
    options = { ...this.#options, ...getOptions(options) }

    options.createIfMissing = options.createIfMissing !== false
    options.errorIfExists = !!options.errorIfExists

    // TODO: document why we do this
    const postopen = this.hooks.postopen.noop ? null : this.hooks.postopen.run
    const passive = options.passive

    if (passive && this.#deferOpen) {
      // Wait a tick until constructor calls open() non-passively
      await undefined
    }

    // Wait for pending changes and check that opening is allowed
    this.#assertUnlocked()
    while (this.#statusChange !== null) await this.#statusChange.catch(noop)
    this.#assertUnlocked()

    if (passive) {
      if (this.#status !== 'open') throw new NotOpenError()
    } else if (this.#status === 'closed' || this.#deferOpen) {
      this.#deferOpen = false
      this.#statusChange = resolvedPromise // TODO: refactor
      this.#statusChange = (async () => {
        this.#status = 'opening'

        try {
          this.emit('opening')
          await this._open(options)
        } catch (err) {
          this.#status = 'closed'

          // Must happen before we close resources, in case their close() is waiting
          // on a deferred operation which in turn is waiting on db.open().
          this.#queue.drain()

          try {
            await this.#closeResources()
          } catch (resourceErr) {
            // eslint-disable-next-line no-ex-assign
            err = combineErrors([err, resourceErr])
          }

          throw new NotOpenError(err)
        }

        this.#status = 'open'

        if (postopen !== null) {
          let hookErr

          try {
            // Prevent deadlock
            this.#statusLocked = true
            await postopen(options)
          } catch (err) {
            hookErr = convertRejection(err)
          } finally {
            this.#statusLocked = false
          }

          // Revert
          if (hookErr) {
            this.#status = 'closing'
            this.#queue.drain()

            try {
              await this.#closeResources()
              await this._close()
            } catch (closeErr) {
              // There's no safe state to return to. Can't return to 'open' because
              // postopen hook failed. Can't return to 'closed' (with the ability to
              // reopen) because the underlying database is potentially still open.
              this.#statusLocked = true
              hookErr = combineErrors([hookErr, closeErr])
            }

            this.#status = 'closed'

            throw new ModuleError('The postopen hook failed on open()', {
              code: 'LEVEL_HOOK_ERROR',
              cause: hookErr
            })
          }
        }

        this.#queue.drain()
        this.emit('open')
      })()

      try {
        await this.#statusChange
      } finally {
        this.#statusChange = null
      }
    } else if (this.#status !== 'open') {
      /* istanbul ignore next: should not happen */
      throw new NotOpenError()
    }
  }

  async _open (options) {}

  async close () {
    // Wait for pending changes and check that closing is allowed
    this.#assertUnlocked()
    while (this.#statusChange !== null) await this.#statusChange.catch(noop)
    this.#assertUnlocked()

    if (this.#status === 'open' || this.#deferOpen) {
      // If close() was called after constructor, we didn't open yet
      const fromInitial = this.#deferOpen

      this.#deferOpen = false
      this.#statusChange = resolvedPromise
      this.#statusChange = (async () => {
        this.#status = 'closing'
        this.#queue.drain()

        try {
          this.emit('closing')
          await this.#closeResources()
          if (!fromInitial) await this._close()
        } catch (err) {
          this.#status = 'open'
          this.#queue.drain()
          throw new NotClosedError(err)
        }

        this.#status = 'closed'
        this.#queue.drain()
        this.emit('closed')
      })()

      try {
        await this.#statusChange
      } finally {
        this.#statusChange = null
      }
    } else if (this.#status !== 'closed') {
      /* istanbul ignore next: should not happen */
      throw new NotClosedError()
    }
  }

  async #closeResources () {
    if (this.#resources.size === 0) {
      return
    }

    // In parallel so that all resources know they are closed
    const resources = Array.from(this.#resources)
    const promises = resources.map(closeResource)
    const results = await Promise.allSettled(promises)
    const errors = []

    for (let i = 0; i < results.length; i++) {
      if (results[i].status === 'fulfilled') {
        this.#resources.delete(resources[i])
      } else {
        errors.push(convertRejection(results[i].reason))
      }
    }

    if (errors.length > 0) {
      throw combineErrors(errors)
    }
  }

  async _close () {}

  async get (key, options) {
    options = getOptions(options, this.#defaultOptions.entry)

    if (this.#status === 'opening') {
      return this.deferAsync(() => this.get(key, options))
    }

    this.#assertOpen()
    this._assertValidKey(key)

    const snapshot = options.snapshot
    const keyEncoding = this.keyEncoding(options.keyEncoding)
    const valueEncoding = this.valueEncoding(options.valueEncoding)
    const keyFormat = keyEncoding.format
    const valueFormat = valueEncoding.format

    // Forward encoding options. Avoid cloning if possible.
    if (options === this.#defaultOptions.entry) {
      options = this.#defaultOptions.entryFormat
    } else if (options.keyEncoding !== keyFormat || options.valueEncoding !== valueFormat) {
      options = { ...options, keyEncoding: keyFormat, valueEncoding: valueFormat }
    }

    const encodedKey = keyEncoding.encode(key)
    const mappedKey = this.prefixKey(encodedKey, keyFormat, true)

    // Keep snapshot open during operation
    snapshot?.ref()

    let value

    try {
      value = await this._get(mappedKey, options)
    } finally {
      // Release snapshot
      snapshot?.unref()
    }

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

  getSync (key, options) {
    if (this.status !== 'open') {
      throw new ModuleError('Database is not open', {
        code: 'LEVEL_DATABASE_NOT_OPEN'
      })
    }

    this._assertValidKey(key)

    // Fast-path for default options (known encoding, no cloning, no snapshot)
    if (options == null) {
      const encodedKey = this.#keyEncoding.encode(key)
      const mappedKey = this.prefixKey(encodedKey, this.#keyEncoding.format, true)
      const value = this._getSync(mappedKey, this.#defaultOptions.entryFormat)

      try {
        return value !== undefined ? this.#valueEncoding.decode(value) : undefined
      } catch (err) {
        throw new ModuleError('Could not decode value', {
          code: 'LEVEL_DECODE_ERROR',
          cause: err
        })
      }
    }

    const snapshot = options.snapshot
    const keyEncoding = this.keyEncoding(options.keyEncoding)
    const valueEncoding = this.valueEncoding(options.valueEncoding)
    const keyFormat = keyEncoding.format
    const valueFormat = valueEncoding.format

    // Forward encoding options. Avoid cloning if possible.
    if (options.keyEncoding !== keyFormat || options.valueEncoding !== valueFormat) {
      options = { ...options, keyEncoding: keyFormat, valueEncoding: valueFormat }
    }

    const encodedKey = keyEncoding.encode(key)
    const mappedKey = this.prefixKey(encodedKey, keyFormat, true)

    let value

    // Keep snapshot open during operation
    snapshot?.ref()

    try {
      value = this._getSync(mappedKey, options)
    } finally {
      // Release snapshot
      snapshot?.unref()
    }

    try {
      return value !== undefined ? valueEncoding.decode(value) : undefined
    } catch (err) {
      throw new ModuleError('Could not decode value', {
        code: 'LEVEL_DECODE_ERROR',
        cause: err
      })
    }
  }

  _getSync (key, options) {
    throw new ModuleError('Database does not support getSync()', {
      code: 'LEVEL_NOT_SUPPORTED'
    })
  }

  async getMany (keys, options) {
    options = getOptions(options, this.#defaultOptions.entry)

    if (this.#status === 'opening') {
      return this.deferAsync(() => this.getMany(keys, options))
    }

    this.#assertOpen()

    if (!Array.isArray(keys)) {
      throw new TypeError("The first argument 'keys' must be an array")
    }

    if (keys.length === 0) {
      return []
    }

    const snapshot = options.snapshot
    const keyEncoding = this.keyEncoding(options.keyEncoding)
    const valueEncoding = this.valueEncoding(options.valueEncoding)
    const keyFormat = keyEncoding.format
    const valueFormat = valueEncoding.format

    // Forward encoding options. Avoid cloning if possible.
    if (options === this.#defaultOptions.entry) {
      options = this.#defaultOptions.entryFormat
    } else if (options.keyEncoding !== keyFormat || options.valueEncoding !== valueFormat) {
      options = { ...options, keyEncoding: keyFormat, valueEncoding: valueFormat }
    }

    const mappedKeys = new Array(keys.length)

    for (let i = 0; i < keys.length; i++) {
      const key = keys[i]
      this._assertValidKey(key)
      mappedKeys[i] = this.prefixKey(keyEncoding.encode(key), keyFormat, true)
    }

    // Keep snapshot open during operation
    snapshot?.ref()

    let values

    try {
      values = await this._getMany(mappedKeys, options)
    } finally {
      // Release snapshot
      snapshot?.unref()
    }

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

  async has (key, options) {
    options = getOptions(options, this.#defaultOptions.key)

    if (this.#status === 'opening') {
      return this.deferAsync(() => this.has(key, options))
    }

    this.#assertOpen()
    this._assertValidKey(key)

    const snapshot = options.snapshot
    const keyEncoding = this.keyEncoding(options.keyEncoding)
    const keyFormat = keyEncoding.format

    // Forward encoding options. Avoid cloning if possible.
    if (options === this.#defaultOptions.key) {
      options = this.#defaultOptions.keyFormat
    } else if (options.keyEncoding !== keyFormat) {
      options = { ...options, keyEncoding: keyFormat }
    }

    const encodedKey = keyEncoding.encode(key)
    const mappedKey = this.prefixKey(encodedKey, keyFormat, true)

    // Keep snapshot open during operation
    snapshot?.ref()

    try {
      return this._has(mappedKey, options)
    } finally {
      // Release snapshot
      snapshot?.unref()
    }
  }

  async _has (key, options) {
    throw new ModuleError('Database does not support has()', {
      code: 'LEVEL_NOT_SUPPORTED'
    })
  }

  async hasMany (keys, options) {
    options = getOptions(options, this.#defaultOptions.key)

    if (this.#status === 'opening') {
      return this.deferAsync(() => this.hasMany(keys, options))
    }

    this.#assertOpen()

    if (!Array.isArray(keys)) {
      throw new TypeError("The first argument 'keys' must be an array")
    }

    if (keys.length === 0) {
      return []
    }

    const snapshot = options.snapshot
    const keyEncoding = this.keyEncoding(options.keyEncoding)
    const keyFormat = keyEncoding.format

    // Forward encoding options. Avoid cloning if possible.
    if (options === this.#defaultOptions.key) {
      options = this.#defaultOptions.keyFormat
    } else if (options.keyEncoding !== keyFormat) {
      options = { ...options, keyEncoding: keyFormat }
    }

    const mappedKeys = new Array(keys.length)

    for (let i = 0; i < keys.length; i++) {
      const key = keys[i]
      this._assertValidKey(key)
      mappedKeys[i] = this.prefixKey(keyEncoding.encode(key), keyFormat, true)
    }

    // Keep snapshot open during operation
    snapshot?.ref()

    try {
      return this._hasMany(mappedKeys, options)
    } finally {
      // Release snapshot
      snapshot?.unref()
    }
  }

  async _hasMany (keys, options) {
    throw new ModuleError('Database does not support hasMany()', {
      code: 'LEVEL_NOT_SUPPORTED'
    })
  }

  async put (key, value, options) {
    if (!this.hooks.prewrite.noop) {
      // Forward to batch() which will run the hook
      // Note: technically means that put() supports the sublevel option in this case,
      // but it generally doesn't per documentation (which makes sense). Same for del().
      return this.batch([{ type: 'put', key, value }], options)
    }

    options = getOptions(options, this.#defaultOptions.entry)

    if (this.#status === 'opening') {
      return this.deferAsync(() => this.put(key, value, options))
    }

    this.#assertOpen()

    this._assertValidKey(key)
    this._assertValidValue(value)

    // Encode data for private API
    const keyEncoding = this.keyEncoding(options.keyEncoding)
    const valueEncoding = this.valueEncoding(options.valueEncoding)
    const keyFormat = keyEncoding.format
    const valueFormat = valueEncoding.format
    const enableWriteEvent = this.#eventMonitor.write
    const original = options

    // Forward encoding options. Avoid cloning if possible.
    if (options === this.#defaultOptions.entry) {
      options = this.#defaultOptions.entryFormat
    } else if (options.keyEncoding !== keyFormat || options.valueEncoding !== valueFormat) {
      options = { ...options, keyEncoding: keyFormat, valueEncoding: valueFormat }
    }

    const encodedKey = keyEncoding.encode(key)
    const prefixedKey = this.prefixKey(encodedKey, keyFormat, true)
    const encodedValue = valueEncoding.encode(value)

    await this._put(prefixedKey, encodedValue, options)

    if (enableWriteEvent) {
      const op = {
        ...original,
        type: 'put',
        key,
        value,
        keyEncoding,
        valueEncoding,
        encodedKey,
        encodedValue
      }

      this.emit('write', [op])
    }
  }

  async _put (key, value, options) {}

  async del (key, options) {
    if (!this.hooks.prewrite.noop) {
      // Forward to batch() which will run the hook
      return this.batch([{ type: 'del', key }], options)
    }

    options = getOptions(options, this.#defaultOptions.key)

    if (this.#status === 'opening') {
      return this.deferAsync(() => this.del(key, options))
    }

    this.#assertOpen()
    this._assertValidKey(key)

    // Encode data for private API
    const keyEncoding = this.keyEncoding(options.keyEncoding)
    const keyFormat = keyEncoding.format
    const enableWriteEvent = this.#eventMonitor.write
    const original = options

    // Forward encoding options. Avoid cloning if possible.
    if (options === this.#defaultOptions.key) {
      options = this.#defaultOptions.keyFormat
    } else if (options.keyEncoding !== keyFormat) {
      options = { ...options, keyEncoding: keyFormat }
    }

    const encodedKey = keyEncoding.encode(key)
    const prefixedKey = this.prefixKey(encodedKey, keyFormat, true)

    await this._del(prefixedKey, options)

    if (enableWriteEvent) {
      const op = {
        ...original,
        type: 'del',
        key,
        keyEncoding,
        encodedKey
      }

      this.emit('write', [op])
    }
  }

  async _del (key, options) {}

  // TODO (future): add way for implementations to declare which options are for the
  // whole batch rather than defaults for individual operations. E.g. the sync option
  // of classic-level, that should not be copied to individual operations.
  batch (operations, options) {
    if (!arguments.length) {
      this.#assertOpen()
      return this._chainedBatch()
    }

    options = getOptions(options, this.#defaultOptions.empty)
    return this.#arrayBatch(operations, options)
  }

  // Wrapped for async error handling
  async #arrayBatch (operations, options) {
    // TODO (not urgent): freeze prewrite hook and write event
    if (this.#status === 'opening') {
      return this.deferAsync(() => this.#arrayBatch(operations, options))
    }

    this.#assertOpen()

    if (!Array.isArray(operations)) {
      throw new TypeError("The first argument 'operations' must be an array")
    }

    if (operations.length === 0) {
      return
    }

    const length = operations.length
    const enablePrewriteHook = !this.hooks.prewrite.noop
    const enableWriteEvent = this.#eventMonitor.write
    const publicOperations = enableWriteEvent ? new Array(length) : null
    const privateOperations = new Array(length)
    const prewriteBatch = enablePrewriteHook
      ? new PrewriteBatch(this, privateOperations, publicOperations)
      : null

    for (let i = 0; i < length; i++) {
      // Clone the op so that we can freely mutate it. We can't use a class because the
      // op can have userland properties that we'd have to copy, negating the performance
      // benefits of a class. So use a plain object.
      const op = { ...options, ...operations[i] }

      // Hook functions can modify op but not its type or sublevel, so cache those
      const isPut = op.type === 'put'
      const delegated = op.sublevel != null
      const db = delegated ? op.sublevel : this

      db._assertValidKey(op.key)

      op.keyEncoding = db.keyEncoding(op.keyEncoding)

      if (isPut) {
        db._assertValidValue(op.value)
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
        publicOperation = { ...op }
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
    options = getOptions(options, this.#defaultOptions.empty)

    if (this.#status === 'opening') {
      return this.deferAsync(() => this.clear(options))
    }

    this.#assertOpen()

    const original = options
    const keyEncoding = this.keyEncoding(options.keyEncoding)
    const snapshot = options.snapshot

    options = rangeOptions(options, keyEncoding)
    options.keyEncoding = keyEncoding.format

    if (options.limit !== 0) {
      // Keep snapshot open during operation
      snapshot?.ref()

      try {
        await this._clear(options)
      } finally {
        // Release snapshot
        snapshot?.unref()
      }

      this.emit('clear', original)
    }
  }

  async _clear (options) {}

  iterator (options) {
    const keyEncoding = this.keyEncoding(options?.keyEncoding)
    const valueEncoding = this.valueEncoding(options?.valueEncoding)

    options = rangeOptions(options, keyEncoding)
    options.keys = options.keys !== false
    options.values = options.values !== false

    // We need the original encoding options in AbstractIterator in order to decode data
    options[AbstractIterator.keyEncoding] = keyEncoding
    options[AbstractIterator.valueEncoding] = valueEncoding

    // Forward encoding options to private API
    options.keyEncoding = keyEncoding.format
    options.valueEncoding = valueEncoding.format

    if (this.#status === 'opening') {
      return new DeferredIterator(this, options)
    }

    this.#assertOpen()
    return this._iterator(options)
  }

  _iterator (options) {
    return new AbstractIterator(this, options)
  }

  keys (options) {
    // Also include valueEncoding (though unused) because we may fallback to _iterator()
    const keyEncoding = this.keyEncoding(options?.keyEncoding)
    const valueEncoding = this.valueEncoding(options?.valueEncoding)

    options = rangeOptions(options, keyEncoding)

    // We need the original encoding options in AbstractKeyIterator in order to decode data
    options[AbstractIterator.keyEncoding] = keyEncoding
    options[AbstractIterator.valueEncoding] = valueEncoding

    // Forward encoding options to private API
    options.keyEncoding = keyEncoding.format
    options.valueEncoding = valueEncoding.format

    if (this.#status === 'opening') {
      return new DeferredKeyIterator(this, options)
    }

    this.#assertOpen()
    return this._keys(options)
  }

  _keys (options) {
    return new DefaultKeyIterator(this, options)
  }

  values (options) {
    const keyEncoding = this.keyEncoding(options?.keyEncoding)
    const valueEncoding = this.valueEncoding(options?.valueEncoding)

    options = rangeOptions(options, keyEncoding)

    // We need the original encoding options in AbstractValueIterator in order to decode data
    options[AbstractIterator.keyEncoding] = keyEncoding
    options[AbstractIterator.valueEncoding] = valueEncoding

    // Forward encoding options to private API
    options.keyEncoding = keyEncoding.format
    options.valueEncoding = valueEncoding.format

    if (this.#status === 'opening') {
      return new DeferredValueIterator(this, options)
    }

    this.#assertOpen()
    return this._values(options)
  }

  _values (options) {
    return new DefaultValueIterator(this, options)
  }

  snapshot (options) {
    this.#assertOpen()

    // Owner is an undocumented option explained in AbstractSnapshot
    if (typeof options !== 'object' || options === null) {
      options = this.#defaultOptions.owner
    } else if (options.owner == null) {
      options = { ...options, owner: this }
    }

    return this._snapshot(options)
  }

  _snapshot (options) {
    throw new ModuleError('Database does not support explicit snapshots', {
      code: 'LEVEL_NOT_SUPPORTED'
    })
  }

  defer (fn, options) {
    if (typeof fn !== 'function') {
      throw new TypeError('The first argument must be a function')
    }

    this.#queue.add(function (abortError) {
      if (!abortError) fn()
    }, options)
  }

  deferAsync (fn, options) {
    if (typeof fn !== 'function') {
      throw new TypeError('The first argument must be a function')
    }

    return new Promise((resolve, reject) => {
      this.#queue.add(function (abortError) {
        if (abortError) reject(abortError)
        else fn().then(resolve, reject)
      }, options)
    })
  }

  attachResource (resource) {
    if (typeof resource !== 'object' || resource === null ||
      typeof resource.close !== 'function') {
      throw new TypeError('The first argument must be a resource object')
    }

    this.#resources.add(resource)
  }

  detachResource (resource) {
    this.#resources.delete(resource)
  }

  _chainedBatch () {
    return new DefaultChainedBatch(this)
  }

  _assertValidKey (key) {
    if (key === null || key === undefined) {
      throw new ModuleError('Key cannot be null or undefined', {
        code: 'LEVEL_INVALID_KEY'
      })
    }
  }

  _assertValidValue (value) {
    if (value === null || value === undefined) {
      throw new ModuleError('Value cannot be null or undefined', {
        code: 'LEVEL_INVALID_VALUE'
      })
    }
  }

  #assertOpen () {
    if (this.#status !== 'open') {
      throw new ModuleError('Database is not open', {
        code: 'LEVEL_DATABASE_NOT_OPEN'
      })
    }
  }

  #assertUnlocked () {
    if (this.#statusLocked) {
      throw new ModuleError('Database status is locked', {
        code: 'LEVEL_STATUS_LOCKED'
      })
    }
  }
}

const { AbstractSublevel } = require('./lib/abstract-sublevel')({ AbstractLevel })

exports.AbstractLevel = AbstractLevel
exports.AbstractSublevel = AbstractSublevel

if (typeof Symbol.asyncDispose === 'symbol') {
  AbstractLevel.prototype[Symbol.asyncDispose] = async function () {
    return this.close()
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
