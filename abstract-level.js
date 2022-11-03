'use strict'

const { supports } = require('level-supports')
const { Transcoder } = require('level-transcoder')
const { EventEmitter } = require('events')
const { fromCallback, fromPromise } = require('catering')
const ModuleError = require('module-error')
const combineErrors = require('maybe-combine-errors')
const { AbstractIterator } = require('./abstract-iterator')
const { DefaultKeyIterator, DefaultValueIterator } = require('./lib/default-kv-iterator')
const { DeferredIterator, DeferredKeyIterator, DeferredValueIterator } = require('./lib/deferred-iterator')
const { DefaultChainedBatch } = require('./lib/default-chained-batch')
const { DatabaseHooks } = require('./lib/hooks')
const { PrewriteBatch } = require('./lib/prewrite-batch')
const { EventMonitor } = require('./lib/event-monitor')
const { getCallback, getOptions, noop, emptyOptions } = require('./lib/common')
const rangeOptions = require('./lib/range-options')

const kPromise = Symbol('promise')
const kLanded = Symbol('landed')
const kResources = Symbol('resources')
const kCloseResources = Symbol('closeResources')
const kOperations = Symbol('operations')
const kUndefer = Symbol('undefer')
const kDeferOpen = Symbol('deferOpen')
const kOptions = Symbol('options')
const kStatus = Symbol('status')
const kDefaultOptions = Symbol('defaultOptions')
const kTranscoder = Symbol('transcoder')
const kKeyEncoding = Symbol('keyEncoding')
const kValueEncoding = Symbol('valueEncoding')
const kEventMonitor = Symbol('eventMonitor')

class AbstractLevel extends EventEmitter {
  constructor (manifest, options) {
    super()

    if (typeof manifest !== 'object' || manifest === null) {
      throw new TypeError("The first argument 'manifest' must be an object")
    }

    options = getOptions(options)
    const { keyEncoding, valueEncoding, passive, ...forward } = options

    this[kResources] = new Set()
    this[kOperations] = []
    this[kDeferOpen] = true
    this[kOptions] = forward
    this[kStatus] = 'opening'

    this.hooks = new DatabaseHooks()

    this.supports = supports(manifest, {
      status: true,
      promises: true,
      clear: true,
      getMany: true,
      deferredOpen: true,

      // TODO (next major): add seek
      snapshots: manifest.snapshots !== false,
      permanence: manifest.permanence !== false,

      // TODO: remove from level-supports because it's always supported
      keyIterator: true,
      valueIterator: true,
      iteratorNextv: true,
      iteratorAll: true,

      // TODO: add to level-supports
      // We don't have to make this an object (e.g. db.supports.hooks.prewrite) because
      // that information is already available in e.g. db.hooks.prewrite != null.
      hooks: true,

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
      { name: 'batch', deprecated: true, alt: 'write' },
      { name: 'ready', deprecated: true, alt: 'open' }
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
    this.nextTick(() => {
      if (this[kDeferOpen]) {
        this.open({ passive: false }, noop)
      }
    })
  }

  get status () {
    return this[kStatus]
  }

  keyEncoding (encoding) {
    return this[kTranscoder].encoding(encoding != null ? encoding : this[kKeyEncoding])
  }

  valueEncoding (encoding) {
    return this[kTranscoder].encoding(encoding != null ? encoding : this[kValueEncoding])
  }

  open (options, callback) {
    callback = getCallback(options, callback)
    callback = fromCallback(callback, kPromise)

    options = { ...this[kOptions], ...getOptions(options) }

    options.createIfMissing = options.createIfMissing !== false
    options.errorIfExists = !!options.errorIfExists

    const maybeOpened = (err) => {
      if (this[kStatus] === 'closing' || this[kStatus] === 'opening') {
        // Wait until pending state changes are done
        this.once(kLanded, err ? () => maybeOpened(err) : maybeOpened)
      } else if (this[kStatus] !== 'open') {
        callback(new ModuleError('Database is not open', {
          code: 'LEVEL_DATABASE_NOT_OPEN',
          cause: err
        }))
      } else {
        callback()
      }
    }

    if (options.passive) {
      if (this[kStatus] === 'opening') {
        this.once(kLanded, maybeOpened)
      } else {
        this.nextTick(maybeOpened)
      }
    } else if (this[kStatus] === 'closed' || this[kDeferOpen]) {
      this[kDeferOpen] = false
      this[kStatus] = 'opening'
      this.emit('opening')

      this._open(options, (err) => {
        if (err) {
          this[kStatus] = 'closed'

          // Resources must be safe to close in any db state
          this[kCloseResources](() => {
            this.emit(kLanded)
            maybeOpened(err)
          })

          this[kUndefer]()
          return
        }

        this[kStatus] = 'open'

        // Skip postopen hook if it has 0 hook functions
        // TODO: write tests
        // TODO (not urgent): freeze postopen.run before we start opening
        if (this.hooks.postopen.noop) {
          return finishOpen()
        }

        // Run postopen hook and convert promise to callback
        fromPromise(this.hooks.postopen.run(options), (hookErr) => {
          // Cancel opening if a hook function threw or closed the database
          if (hookErr || this[kStatus] !== 'open') {
            return this.close((closeErr) => {
              if (hookErr) {
                callback(new ModuleError('The postopen hook failed on open()', {
                  code: 'LEVEL_HOOK_ERROR',
                  cause: combineErrors([hookErr, closeErr])
                }))
              } else {
                // Means the hook function is responsible for handling closeErr
                callback(new ModuleError('The postopen hook has closed the database', {
                  code: 'LEVEL_HOOK_ERROR'
                }))
              }
            })
          }

          finishOpen()
        })
      })

      const finishOpen = () => {
        this[kUndefer]()
        this.emit(kLanded)

        // Only emit public event if pending state changes are done
        if (this[kStatus] === 'open') this.emit('open')

        // TODO (next major): remove this alias
        if (this[kStatus] === 'open') this.emit('ready')

        maybeOpened()
      }
    } else if (this[kStatus] === 'open') {
      this.nextTick(maybeOpened)
    } else {
      this.once(kLanded, () => this.open(options, callback))
    }

    return callback[kPromise]
  }

  _open (options, callback) {
    this.nextTick(callback)
  }

  close (callback) {
    callback = fromCallback(callback, kPromise)

    const maybeClosed = (err) => {
      if (this[kStatus] === 'opening' || this[kStatus] === 'closing') {
        // Wait until pending state changes are done
        this.once(kLanded, err ? maybeClosed(err) : maybeClosed)
      } else if (this[kStatus] !== 'closed') {
        callback(new ModuleError('Database is not closed', {
          code: 'LEVEL_DATABASE_NOT_CLOSED',
          cause: err
        }))
      } else {
        callback()
      }
    }

    if (this[kStatus] === 'open') {
      this[kStatus] = 'closing'
      this.emit('closing')

      const cancel = (err) => {
        this[kStatus] = 'open'
        this[kUndefer]()
        this.emit(kLanded)
        maybeClosed(err)
      }

      this[kCloseResources](() => {
        this._close((err) => {
          if (err) return cancel(err)

          this[kStatus] = 'closed'
          this[kUndefer]()
          this.emit(kLanded)

          // Only emit public event if pending state changes are done
          if (this[kStatus] === 'closed') this.emit('closed')

          maybeClosed()
        })
      })
    } else if (this[kStatus] === 'closed') {
      this.nextTick(maybeClosed)
    } else {
      this.once(kLanded, () => this.close(callback))
    }

    return callback[kPromise]
  }

  [kCloseResources] (callback) {
    if (this[kResources].size === 0) {
      return this.nextTick(callback)
    }

    let pending = this[kResources].size
    let sync = true

    const next = () => {
      if (--pending === 0) {
        // We don't have tests for generic resources, so dezalgo
        if (sync) this.nextTick(callback)
        else callback()
      }
    }

    // In parallel so that all resources know they are closed
    for (const resource of this[kResources]) {
      resource.close(next)
    }

    sync = false
    this[kResources].clear()
  }

  _close (callback) {
    this.nextTick(callback)
  }

  get (key, options, callback) {
    callback = getCallback(options, callback)
    callback = fromCallback(callback, kPromise)
    options = getOptions(options, this[kDefaultOptions].entry)

    if (this[kStatus] === 'opening') {
      this.defer(() => this.get(key, options, callback))
      return callback[kPromise]
    }

    if (maybeError(this, callback)) {
      return callback[kPromise]
    }

    const err = this._checkKey(key)

    if (err) {
      this.nextTick(callback, err)
      return callback[kPromise]
    }

    const keyEncoding = this.keyEncoding(options.keyEncoding)
    const valueEncoding = this.valueEncoding(options.valueEncoding)
    const keyFormat = keyEncoding.format
    const valueFormat = valueEncoding.format

    // Forward encoding options to the underlying store
    if (options.keyEncoding !== keyFormat || options.valueEncoding !== valueFormat) {
      // Avoid spread operator because of https://bugs.chromium.org/p/chromium/issues/detail?id=1204540
      options = Object.assign({}, options, { keyEncoding: keyFormat, valueEncoding: valueFormat })
    }

    this._get(this.prefixKey(keyEncoding.encode(key), keyFormat), options, (err, value) => {
      if (err) {
        // Normalize not found error for backwards compatibility with abstract-leveldown and level(up)
        if (err.code === 'LEVEL_NOT_FOUND' || err.notFound || /NotFound/i.test(err)) {
          if (!err.code) err.code = 'LEVEL_NOT_FOUND' // Preferred way going forward
          if (!err.notFound) err.notFound = true // Same as level-errors
          if (!err.status) err.status = 404 // Same as level-errors
        }

        return callback(err)
      }

      try {
        value = valueEncoding.decode(value)
      } catch (err) {
        return callback(new ModuleError('Could not decode value', {
          code: 'LEVEL_DECODE_ERROR',
          cause: err
        }))
      }

      callback(null, value)
    })

    return callback[kPromise]
  }

  _get (key, options, callback) {
    this.nextTick(callback, new Error('NotFound'))
  }

  getMany (keys, options, callback) {
    callback = getCallback(options, callback)
    callback = fromCallback(callback, kPromise)
    options = getOptions(options, this[kDefaultOptions].entry)

    if (this[kStatus] === 'opening') {
      this.defer(() => this.getMany(keys, options, callback))
      return callback[kPromise]
    }

    if (maybeError(this, callback)) {
      return callback[kPromise]
    }

    if (!Array.isArray(keys)) {
      this.nextTick(callback, new TypeError("The first argument 'keys' must be an array"))
      return callback[kPromise]
    }

    if (keys.length === 0) {
      this.nextTick(callback, null, [])
      return callback[kPromise]
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

      if (err) {
        this.nextTick(callback, err)
        return callback[kPromise]
      }

      mappedKeys[i] = this.prefixKey(keyEncoding.encode(key), keyFormat)
    }

    this._getMany(mappedKeys, options, (err, values) => {
      if (err) return callback(err)

      try {
        for (let i = 0; i < values.length; i++) {
          if (values[i] !== undefined) {
            values[i] = valueEncoding.decode(values[i])
          }
        }
      } catch (err) {
        return callback(new ModuleError(`Could not decode one or more of ${values.length} value(s)`, {
          code: 'LEVEL_DECODE_ERROR',
          cause: err
        }))
      }

      callback(null, values)
    })

    return callback[kPromise]
  }

  _getMany (keys, options, callback) {
    this.nextTick(callback, null, new Array(keys.length).fill(undefined))
  }

  put (key, value, options, callback) {
    if (!this.hooks.prewrite.noop) {
      // Forward to batch() which will run the hook
      // Note: technically means that put() supports the sublevel option in this case,
      // but it generally doesn't per documentation (which makes sense). Same for del().
      return this.batch([{ type: 'put', key, value }], options, callback)
    }

    callback = getCallback(options, callback)
    callback = fromCallback(callback, kPromise)
    options = getOptions(options, this[kDefaultOptions].entry)

    if (this[kStatus] === 'opening') {
      this.defer(() => this.put(key, value, options, callback))
      return callback[kPromise]
    }

    if (maybeError(this, callback)) {
      return callback[kPromise]
    }

    const err = this._checkKey(key) || this._checkValue(value)

    if (err) {
      this.nextTick(callback, err)
      return callback[kPromise]
    }

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
    const prefixedKey = this.prefixKey(encodedKey, keyFormat)
    const encodedValue = valueEncoding.encode(value)

    this._put(prefixedKey, encodedValue, options, (err) => {
      if (err) return callback(err)

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

      callback()
    })

    return callback[kPromise]
  }

  _put (key, value, options, callback) {
    this.nextTick(callback)
  }

  del (key, options, callback) {
    if (!this.hooks.prewrite.noop) {
      // Forward to batch() which will run the hook
      return this.batch([{ type: 'del', key }], options, callback)
    }

    callback = getCallback(options, callback)
    callback = fromCallback(callback, kPromise)
    options = getOptions(options, this[kDefaultOptions].key)

    if (this[kStatus] === 'opening') {
      this.defer(() => this.del(key, options, callback))
      return callback[kPromise]
    }

    if (maybeError(this, callback)) {
      return callback[kPromise]
    }

    const err = this._checkKey(key)

    if (err) {
      this.nextTick(callback, err)
      return callback[kPromise]
    }

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
    const prefixedKey = this.prefixKey(encodedKey, keyFormat)

    this._del(prefixedKey, options, (err) => {
      if (err) return callback(err)

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

      callback()
    })

    return callback[kPromise]
  }

  _del (key, options, callback) {
    this.nextTick(callback)
  }

  // TODO (future): add way for implementations to declare which options are for the
  // whole batch rather than defaults for individual operations. E.g. the sync option
  // of classic-level, that should not be copied to individual operations.
  batch (operations, options, callback) {
    if (!arguments.length) {
      if (this[kStatus] === 'opening') return new DefaultChainedBatch(this)
      if (this[kStatus] !== 'open') {
        throw new ModuleError('Database is not open', {
          code: 'LEVEL_DATABASE_NOT_OPEN'
        })
      }
      return this._chainedBatch()
    }

    if (typeof operations === 'function') callback = operations
    else callback = getCallback(options, callback)

    callback = fromCallback(callback, kPromise)
    options = getOptions(options, this[kDefaultOptions].empty)

    // TODO (not urgent): freeze prewrite hook and write event
    if (this[kStatus] === 'opening') {
      this.defer(() => this.batch(operations, options, callback))
      return callback[kPromise]
    }

    if (maybeError(this, callback)) {
      return callback[kPromise]
    }

    if (!Array.isArray(operations)) {
      this.nextTick(callback, new TypeError("The first argument 'operations' must be an array"))
      return callback[kPromise]
    }

    if (operations.length === 0) {
      this.nextTick(callback)
      return callback[kPromise]
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

      if (keyError != null) {
        this.nextTick(callback, keyError)
        return callback[kPromise]
      }

      op.keyEncoding = db.keyEncoding(op.keyEncoding)

      if (isPut) {
        const valueError = db._checkValue(op.value)

        if (valueError != null) {
          this.nextTick(callback, valueError)
          return callback[kPromise]
        }

        op.valueEncoding = db.valueEncoding(op.valueEncoding)
      } else if (op.type !== 'del') {
        this.nextTick(callback, new TypeError("A batch operation must have a type property that is 'put' or 'del'"))
        return callback[kPromise]
      }

      if (enablePrewriteHook) {
        try {
          this.hooks.prewrite.run(op, prewriteBatch)

          // Normalize encodings again in case they were modified
          op.keyEncoding = db.keyEncoding(op.keyEncoding)
          if (isPut) op.valueEncoding = db.valueEncoding(op.valueEncoding)
        } catch (err) {
          this.nextTick(callback, new ModuleError('The prewrite hook failed on batch()', {
            code: 'LEVEL_HOOK_ERROR',
            cause: err
          }))

          return callback[kPromise]
        }
      }

      // Encode data for private API
      // TODO: benchmark a try/catch around this
      const keyEncoding = op.keyEncoding
      const encodedKey = keyEncoding.encode(op.key)
      const keyFormat = keyEncoding.format
      const prefixedKey = db.prefixKey(encodedKey, keyFormat)

      // Prevent double prefixing
      if (delegated) op.sublevel = null

      let publicOperation = null

      if (enableWriteEvent) {
        // Clone op before we mutate it for the private API
        // TODO (future semver-major): consider sending this shape to private API too
        publicOperation = Object.assign({}, op)

        if (delegated) {
          // Ensure emitted data makes sense in the context of this db
          publicOperation.key = prefixedKey
          publicOperation.keyEncoding = this.keyEncoding(keyFormat)
          publicOperation.encodedKey = prefixedKey
        } else {
          publicOperation.encodedKey = encodedKey
        }

        publicOperations[i] = publicOperation
      }

      op.key = prefixedKey
      op.keyEncoding = keyFormat

      if (isPut) {
        const valueEncoding = op.valueEncoding
        const encodedValue = valueEncoding.encode(op.value)
        const valueFormat = valueEncoding.format

        op.value = encodedValue
        op.valueEncoding = valueFormat

        if (enableWriteEvent) {
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

    this._batch(privateOperations, options, (err) => {
      if (err) return callback(err)

      if (enableWriteEvent) {
        this.emit('write', publicOperations)
      } else if (!enablePrewriteHook) {
        // TODO (semver-major): remove
        this.emit('batch', operations)
      }

      callback()
    })

    return callback[kPromise]
  }

  _batch (operations, options, callback) {
    this.nextTick(callback)
  }

  sublevel (name, options) {
    const xopts = AbstractSublevel.defaults(options)
    const sublevel = this._sublevel(name, xopts)

    // TODO: write test
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

  prefixKey (key, keyFormat) {
    return key
  }

  clear (options, callback) {
    callback = getCallback(options, callback)
    callback = fromCallback(callback, kPromise)
    options = getOptions(options, this[kDefaultOptions].empty)

    if (this[kStatus] === 'opening') {
      this.defer(() => this.clear(options, callback))
      return callback[kPromise]
    }

    if (maybeError(this, callback)) {
      return callback[kPromise]
    }

    const original = options
    const keyEncoding = this.keyEncoding(options.keyEncoding)

    options = rangeOptions(options, keyEncoding)
    options.keyEncoding = keyEncoding.format

    if (options.limit === 0) {
      this.nextTick(callback)
    } else {
      this._clear(options, (err) => {
        if (err) return callback(err)
        this.emit('clear', original)
        callback()
      })
    }

    return callback[kPromise]
  }

  _clear (options, callback) {
    this.nextTick(callback)
  }

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
    } else if (this[kStatus] !== 'open') {
      throw new ModuleError('Database is not open', {
        code: 'LEVEL_DATABASE_NOT_OPEN'
      })
    }

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
    } else if (this[kStatus] !== 'open') {
      throw new ModuleError('Database is not open', {
        code: 'LEVEL_DATABASE_NOT_OPEN'
      })
    }

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
    } else if (this[kStatus] !== 'open') {
      throw new ModuleError('Database is not open', {
        code: 'LEVEL_DATABASE_NOT_OPEN'
      })
    }

    return this._values(options)
  }

  _values (options) {
    return new DefaultValueIterator(this, options)
  }

  defer (fn) {
    if (typeof fn !== 'function') {
      throw new TypeError('The first argument must be a function')
    }

    this[kOperations].push(fn)
  }

  [kUndefer] () {
    if (this[kOperations].length === 0) {
      return
    }

    const operations = this[kOperations]
    this[kOperations] = []

    for (const op of operations) {
      op()
    }
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

// Expose browser-compatible nextTick for dependents
// TODO: after we drop node 10, also use queueMicrotask in node
AbstractLevel.prototype.nextTick = require('./lib/next-tick')

const { AbstractSublevel } = require('./lib/abstract-sublevel')({ AbstractLevel })

exports.AbstractLevel = AbstractLevel
exports.AbstractSublevel = AbstractSublevel

const maybeError = function (db, callback) {
  if (db[kStatus] !== 'open') {
    db.nextTick(callback, new ModuleError('Database is not open', {
      code: 'LEVEL_DATABASE_NOT_OPEN'
    }))
    return true
  }

  return false
}

const formats = function (db) {
  return Object.keys(db.supports.encodings)
    .filter(k => !!db.supports.encodings[k])
}
