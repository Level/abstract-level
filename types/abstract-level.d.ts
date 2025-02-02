import { IManifest } from 'level-supports'
import * as Transcoder from 'level-transcoder'
import { EventEmitter } from 'events'
import { AbstractChainedBatch } from './abstract-chained-batch'
import { AbstractSublevel, AbstractSublevelOptions } from './abstract-sublevel'
import { AbstractSnapshot } from './abstract-snapshot'

import {
  AbstractIterator,
  AbstractIteratorOptions,
  AbstractKeyIterator,
  AbstractKeyIteratorOptions,
  AbstractValueIterator,
  AbstractValueIteratorOptions
} from './abstract-iterator'

import { AbstractReadOptions, AbstractResource, RangeOptions } from './interfaces'

/**
 * Abstract class for a lexicographically sorted key-value database.
 *
 * @template TFormat The type used internally by the database to store data.
 * @template KDefault The default type of keys if not overridden on operations.
 * @template VDefault The default type of values if not overridden on operations.
 */
declare class AbstractLevel<TFormat, KDefault = string, VDefault = string>
  extends EventEmitter implements AbstractResource {
  /**
   * Private database constructor.
   *
   * @param manifest A [manifest](https://github.com/Level/supports) describing the
   * features supported by (the private API of) this database.
   * @param options Options, of which some will be forwarded to {@link open}.
   */
  constructor (
    manifest: Partial<IManifest>,
    options?: AbstractDatabaseOptions<KDefault, VDefault> | undefined
  )

  /**
   * A [manifest](https://github.com/Level/supports) describing the features
   * supported by this database.
   */
  supports: IManifest

  /**
   * Allows userland _hook functions_ to customize behavior of the database.
   */
  hooks: AbstractDatabaseHooks<typeof this>

  /**
   * Read-only getter that returns a string reflecting the current state of the database:
   *
   * - `'opening'` - waiting for the database to be opened
   * - `'open'` - successfully opened the database
   * - `'closing'` - waiting for the database to be closed
   * - `'closed'` - database is closed.
   */
  get status (): 'opening' | 'open' | 'closing' | 'closed'

  /**
   * Open the database.
   */
  open (): Promise<void>
  open (options: AbstractOpenOptions): Promise<void>

  /**
   * Close the database.
   */
  close (): Promise<void>

  /**
   * Close the database.
   */
  [Symbol.asyncDispose](): Promise<void>

  /**
   * Get a value from the database by {@link key}.
   */
  get (key: KDefault): Promise<VDefault | undefined>
  get<K = KDefault, V = VDefault> (key: K, options: AbstractGetOptions<K, V>): Promise<V | undefined>

  /**
   * Synchronously get a value from the database by {@link key}.
   */
  getSync (key: KDefault): VDefault | undefined
  getSync<K = KDefault, V = VDefault> (key: K, options: AbstractGetOptions<K, V>): V | undefined

  /**
   * Get multiple values from the database by an array of {@link keys}.
   */
  getMany (keys: KDefault[]): Promise<(VDefault | undefined)[]>

  getMany<K = KDefault, V = VDefault> (
    keys: K[],
    options: AbstractGetManyOptions<K, V>
  ): Promise<(V | undefined)[]>

  /**
   * Check if the database has an entry with the given {@link key}.
   *
   * @returns A promise for a boolean that will be true if the entry exists.
   *
   * @example
   * ```js
   * if (await db.has('fruit')) {
   *   console.log('We have fruit')
   * }
   * ```
   */
  has (key: KDefault): Promise<boolean>
  has<K = KDefault> (key: K, options: AbstractHasOptions<K>): Promise<boolean>

  /**
   * Check if the database has entries with the given {@link keys}.
   *
   * @returns A promise for an array of booleans with the same order as {@link keys}.
   *
   * @example
   * ```js
   * await db.put('a', '123')
   * await db.hasMany(['a', 'b']) // [true, false]
   * ```
   */
  hasMany (keys: KDefault[]): Promise<boolean[]>
  hasMany<K = KDefault> (keys: K[], options: AbstractHasManyOptions<K>): Promise<boolean[]>

  /**
   * Add a new entry or overwrite an existing entry.
   */
  put (key: KDefault, value: VDefault): Promise<void>

  put<K = KDefault, V = VDefault> (
    key: K,
    value: V,
    options: AbstractPutOptions<K, V>
  ): Promise<void>

  /**
   * Delete an entry by {@link key}.
   */
  del (key: KDefault): Promise<void>

  del<K = KDefault> (
    key: K,
    options: AbstractDelOptions<K>
  ): Promise<void>

  /**
   * Perform multiple _put_ and/or _del_ operations in bulk.
   */
  batch (
    operations: Array<AbstractBatchOperation<typeof this, KDefault, VDefault>>
  ): Promise<void>

  batch<K = KDefault, V = VDefault> (
    operations: Array<AbstractBatchOperation<typeof this, K, V>>,
    options: AbstractBatchOptions<K, V>
  ): Promise<void>

  batch (): AbstractChainedBatch<typeof this, KDefault, VDefault>

  /**
   * Create an iterator. For example:
   *
   * ```js
   * for await (const [key, value] of db.iterator({ gte: 'a' })) {
   *   console.log([key, value])
   * }
   * ```
   */
  iterator (): AbstractIterator<typeof this, KDefault, VDefault>
  iterator<K = KDefault, V = VDefault> (
    options: AbstractIteratorOptions<K, V>
  ): AbstractIterator<typeof this, K, V>

  /**
   * Create a key iterator. For example:
   *
   * ```js
   * for await (const key of db.keys({ gte: 'a' })) {
   *   console.log(key)
   * }
   * ```
   */
  keys (): AbstractKeyIterator<typeof this, KDefault>
  keys<K = KDefault> (
    options: AbstractKeyIteratorOptions<K>
  ): AbstractKeyIterator<typeof this, K>

  /**
   * Create a value iterator. For example:
   *
   * ```js
   * for await (const value of db.values({ gte: 'a' })) {
   *   console.log(value)
   * }
   * ```
   */
  values (): AbstractValueIterator<typeof this, KDefault, VDefault>
  values<K = KDefault, V = VDefault> (
    options: AbstractValueIteratorOptions<K, V>
  ): AbstractValueIterator<typeof this, K, V>

  /**
   * Delete all entries or a range.
   */
  clear (): Promise<void>
  clear<K = KDefault> (options: AbstractClearOptions<K>): Promise<void>

  /**
   * Create a sublevel.
   * @param name Name of the sublevel, used to prefix keys.
   */
  sublevel (name: string | string[]): AbstractSublevel<typeof this, TFormat, string, string>
  sublevel<K = string, V = string> (
    name: string | string[],
    options: AbstractSublevelOptions<K, V>
  ): AbstractSublevel<typeof this, TFormat, K, V>

  /**
   * Add sublevel prefix to the given {@link key}, which must be already-encoded. If this
   * database is not a sublevel, the given {@link key} is returned as-is.
   *
   * @param key Key to add prefix to.
   * @param keyFormat Format of {@link key}. One of `'utf8'`, `'buffer'`, `'view'`.
   * If `'utf8'` then {@link key} must be a string and the return value will be a string.
   * If `'buffer'` then Buffer, if `'view'` then Uint8Array.
   * @param local If true, add prefix for parent database, else for root database (default).
   */
  prefixKey (key: string, keyFormat: 'utf8', local?: boolean | undefined): string
  prefixKey (key: Buffer, keyFormat: 'buffer', local?: boolean | undefined): Buffer
  prefixKey (key: Uint8Array, keyFormat: 'view', local?: boolean | undefined): Uint8Array

  /**
   * Returns the given {@link encoding} argument as a normalized encoding object
   * that follows the [`level-transcoder`](https://github.com/Level/transcoder)
   * encoding interface.
   */
  keyEncoding<N extends Transcoder.KnownEncodingName> (
    encoding: N
  ): Transcoder.KnownEncoding<N, TFormat>

  keyEncoding<TIn, TOut> (
    encoding: Transcoder.MixedEncoding<TIn, any, TOut>
  ): Transcoder.Encoding<TIn, TFormat, TOut>

  /**
   * Returns the default key encoding of the database as a normalized encoding
   * object that follows the [`level-transcoder`](https://github.com/Level/transcoder)
   * encoding interface.
   */
  keyEncoding (): Transcoder.Encoding<KDefault, TFormat, KDefault>

  /**
   * Returns the given {@link encoding} argument as a normalized encoding object
   * that follows the [`level-transcoder`](https://github.com/Level/transcoder)
   * encoding interface.
   */
  valueEncoding<N extends Transcoder.KnownEncodingName> (
    encoding: N
  ): Transcoder.KnownEncoding<N, TFormat>

  valueEncoding<TIn, TOut> (
    encoding: Transcoder.MixedEncoding<TIn, any, TOut>
  ): Transcoder.Encoding<TIn, TFormat, TOut>

  /**
   * Returns the default value encoding of the database as a normalized encoding
   * object that follows the [`level-transcoder`](https://github.com/Level/transcoder)
   * encoding interface.
   */
  valueEncoding (): Transcoder.Encoding<VDefault, TFormat, VDefault>

  /**
   * Create an explicit snapshot. Throws a `LEVEL_NOT_SUPPORTED` error if
   * `db.supports.explicitSnapshots` is false ([Level/community#118][1]).
   *
   * @param options There are currently no options but specific implementations
   * may add their own.
   *
   * @example
   * ```ts
   * await db.put('example', 'before')
   * await using snapshot = db.snapshot()
   * await db.put('example', 'after')
   * await db.get('example', { snapshot })) // Returns 'before'
   * ```
   *
   * [1]: https://github.com/Level/community/issues/118
   */
  snapshot (options?: any | undefined): AbstractSnapshot

  /**
   * Call the function {@link fn} at a later time when {@link status} changes to
   * `'open'` or `'closed'`. Known as a _deferred operation_.
   *
   * @param fn Synchronous function to (eventually) call.
   * @param options Options for the deferred operation.
   */
  defer (fn: Function, options?: AbstractDeferOptions | undefined): void

  /**
   * Call the function {@link fn} at a later time when {@link status} changes to
   * `'open'` or `'closed'`. Known as a _deferred operation_.
   *
   * @param fn Asynchronous function to (eventually) call.
   * @param options Options for the deferred operation.
   * @returns A promise for the result of {@link fn}.
   */
  deferAsync<T> (fn: () => Promise<T>, options?: AbstractDeferOptions | undefined): Promise<T>

  /**
   * Keep track of the given {@link resource} in order to call its `close()` method when
   * the database is closed. Once successfully closed, the resource will no longer be
   * tracked, to the same effect as manually calling {@link detachResource}. When given
   * multiple resources, the database will close them in parallel. Resources are kept in
   * a {@link Set} so that the same object will not be attached (and closed) twice.
   *
   * Intended for objects that rely on an open database. Used internally for built-in
   * resources like iterators and sublevels, and is publicly exposed for custom
   * resources.
   */
  attachResource(resource: AbstractResource): void

  /**
   * Stop tracking the given {@link resource}.
   */
  detachResource(resource: AbstractResource): void
}

export { AbstractLevel }

/**
 * Options for the database constructor.
 */
export interface AbstractDatabaseOptions<K, V>
  extends Omit<AbstractOpenOptions, 'passive'> {
  /**
   * Encoding to use for keys.
   * @defaultValue `'utf8'`
   */
  keyEncoding?: string | Transcoder.PartialEncoding<K> | undefined

  /**
   * Encoding to use for values.
   * @defaultValue `'utf8'`
   */
  valueEncoding?: string | Transcoder.PartialEncoding<V> | undefined
}

/**
 * Options for the {@link AbstractLevel.open} method.
 */
export interface AbstractOpenOptions {
  /**
   * If `true`, create an empty database if one doesn't already exist. If `false`
   * and the database doesn't exist, opening will fail.
   *
   * @defaultValue `true`
   */
  createIfMissing?: boolean | undefined

  /**
   * If `true` and the database already exists, opening will fail.
   *
   * @defaultValue `false`
   */
  errorIfExists?: boolean | undefined

  /**
   * Wait for, but do not initiate, opening of the database.
   *
   * @defaultValue `false`
   */
  passive?: boolean | undefined
}

/**
 * Options for the {@link AbstractLevel.get} method.
 */
export interface AbstractGetOptions<K, V> extends AbstractReadOptions {
  /**
   * Custom key encoding for this operation, used to encode the `key`.
   */
  keyEncoding?: string | Transcoder.PartialEncoder<K> | undefined

  /**
   * Custom value encoding for this operation, used to decode the value.
   */
  valueEncoding?: string | Transcoder.PartialDecoder<V> | undefined
}

/**
 * Options for the {@link AbstractLevel.getMany} method.
 */
export interface AbstractGetManyOptions<K, V> extends AbstractReadOptions {
  /**
   * Custom key encoding for this operation, used to encode the `keys`.
   */
  keyEncoding?: string | Transcoder.PartialEncoder<K> | undefined

  /**
   * Custom value encoding for this operation, used to decode values.
   */
  valueEncoding?: string | Transcoder.PartialDecoder<V> | undefined
}

/**
 * Options for the {@link AbstractLevel.has} method.
 */
export interface AbstractHasOptions<K> extends AbstractReadOptions {
  /**
   * Custom key encoding for this operation, used to encode the `key`.
   */
  keyEncoding?: string | Transcoder.PartialEncoder<K> | undefined
}

/**
 * Options for the {@link AbstractLevel.hasMany} method.
 */
export interface AbstractHasManyOptions<K> extends AbstractReadOptions {
  /**
   * Custom key encoding for this operation, used to encode the `keys`.
   */
  keyEncoding?: string | Transcoder.PartialEncoder<K> | undefined
}

/**
 * Options for the {@link AbstractLevel.put} method.
 */
export interface AbstractPutOptions<K, V> {
  /**
   * Custom key encoding for this operation, used to encode the `key`.
   */
  keyEncoding?: string | Transcoder.PartialEncoder<K> | undefined

  /**
   * Custom value encoding for this operation, used to encode the `value`.
   */
  valueEncoding?: string | Transcoder.PartialEncoder<V> | undefined
}

/**
 * Options for the {@link AbstractLevel.del} method.
 */
export interface AbstractDelOptions<K> {
  /**
   * Custom key encoding for this operation, used to encode the `key`.
   */
  keyEncoding?: string | Transcoder.PartialEncoder<K> | undefined
}

/**
 * Options for the {@link AbstractLevel.batch} method.
 */
export interface AbstractBatchOptions<K, V> {
  /**
   * Custom key encoding for this batch, used to encode keys.
   */
  keyEncoding?: string | Transcoder.PartialEncoder<K> | undefined

  /**
   * Custom value encoding for this batch, used to encode values.
   */
  valueEncoding?: string | Transcoder.PartialEncoder<V> | undefined
}

/**
 * A _put_ or _del_ operation to be committed with the {@link AbstractLevel.batch}
 * method.
 */
export type AbstractBatchOperation<TDatabase, K, V> =
  AbstractBatchPutOperation<TDatabase, K, V> | AbstractBatchDelOperation<TDatabase, K>

/**
 * A _put_ operation to be committed with the {@link AbstractLevel.batch} method.
 */
export interface AbstractBatchPutOperation<TDatabase, K, V> {
  type: 'put'
  key: K
  value: V

  /**
   * Custom key encoding for this _put_ operation, used to encode the {@link key}.
   */
  keyEncoding?: string | Transcoder.PartialEncoding<K> | undefined

  /**
   * Custom key encoding for this _put_ operation, used to encode the {@link value}.
   */
  valueEncoding?: string | Transcoder.PartialEncoding<V> | undefined

  /**
   * Act as though the _put_ operation is performed on the given sublevel, to similar
   * effect as:
   *
   * ```js
   * await sublevel.batch([{ type: 'put', key, value }])
   * ```
   *
   * This allows atomically committing data to multiple sublevels. The {@link key} will
   * be prefixed with the `prefix` of the sublevel, and the {@link key} and {@link value}
   * will be encoded by the sublevel (using the default encodings of the sublevel unless
   * {@link keyEncoding} and / or {@link valueEncoding} are provided).
   */
  sublevel?: AbstractSublevel<TDatabase, any, any, any> | undefined
}

/**
 * A _del_ operation to be committed with the {@link AbstractLevel.batch} method.
 */
export interface AbstractBatchDelOperation<TDatabase, K> {
  type: 'del'
  key: K

  /**
   * Custom key encoding for this _del_ operation, used to encode the {@link key}.
   */
  keyEncoding?: string | Transcoder.PartialEncoding<K> | undefined

  /**
   * Act as though the _del_ operation is performed on the given sublevel, to similar
   * effect as:
   *
   * ```js
   * await sublevel.batch([{ type: 'del', key }])
   * ```
   *
   * This allows atomically committing data to multiple sublevels. The {@link key} will
   * be prefixed with the `prefix` of the sublevel, and the {@link key} will be encoded
   * by the sublevel (using the default key encoding of the sublevel unless
   * {@link keyEncoding} is provided).
   */
  sublevel?: AbstractSublevel<TDatabase, any, any, any> | undefined
}

/**
 * Options for the {@link AbstractLevel.clear} method.
 */
export interface AbstractClearOptions<K> extends RangeOptions<K> {
  /**
   * Custom key encoding for this operation, used to encode range options.
   */
  keyEncoding?: string | Transcoder.PartialEncoding<K> | undefined

  /**
   * Explicit snapshot to read from, such that entries not present in the snapshot will
   * not be deleted.
   */
  snapshot?: AbstractSnapshot | undefined
}

/**
 * Allows userland _hook functions_ to customize behavior of the database.
 *
 * @template TDatabase Type of database.
 */
export interface AbstractDatabaseHooks<
  TDatabase,
  TOpenOptions = AbstractOpenOptions,
  TBatchOperation = AbstractBatchOperation<TDatabase, any, any>> {
  /**
   * An asynchronous hook that runs after the database has succesfully opened, but before
   * deferred operations are executed and before events are emitted. Example:
   *
   * ```js
   * db.hooks.postopen.add(async function () {
   *   // Initialize data
   * })
   * ```
   */
  postopen: AbstractHook<(options: TOpenOptions) => Promise<void>>

  /**
   * A synchronous hook for modifying or adding operations. Example:
   *
   * ```js
   * db.hooks.prewrite.add(function (op, batch) {
   *   op.key = op.key.toUpperCase()
   * })
   * ```
   *
   * @todo Define type of `op`.
   */
  prewrite: AbstractHook<(op: any, batch: AbstractPrewriteBatch<TBatchOperation>) => void>

  /**
   * A synchronous hook that runs when an {@link AbstractSublevel} instance has been
   * created by {@link AbstractLevel.sublevel()}.
   */
  newsub: AbstractHook<(
    sublevel: AbstractSublevel<TDatabase, any, any, any>,
    options: AbstractSublevelOptions<any, any>
  ) => void>
}

/**
 * An interface for prewrite hook functions to add operations, to be committed in the
 * same batch as the input operation(s).
 */
export interface AbstractPrewriteBatch<TBatchOperation> {
  /**
   * Add a batch operation.
   */
  add: (op: TBatchOperation) => this
}

/**
 * @template TFn The hook-specific function signature.
 */
export interface AbstractHook<TFn extends Function> {
  /**
   * Add the given {@link fn} function to this hook, if it wasn't already added.
   * @param fn Hook function.
   */
  add: (fn: TFn) => void

  /**
   * Remove the given {@link fn} function from this hook.
   * @param fn Hook function.
   */
  delete: (fn: TFn) => void
}

/**
 * Options for {@link AbstractLevel.defer()} and {@link AbstractLevel.deferAsync()}.
 */
export interface AbstractDeferOptions {
  /**
   * An [`AbortSignal`][1] to abort the deferred operation.
   *
   * [1]: https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal
   */
  signal?: AbortSignal | undefined
}
