import { IManifest } from 'level-supports'
import * as Transcoder from 'level-transcoder'
import { EventEmitter } from 'events'
import { AbstractChainedBatch } from '..'
import { AbstractIterator, AbstractIteratorOptions } from './abstract-iterator'
import { NodeCallback, RangeOptions } from './interfaces'

/**
 * Abstract prototype for a lexicographically sorted key-value database.
 *
 * @template TFormat The type used internally by the database to store data.
 * @template KDefault The default type of keys if not overridden on operations.
 * @template VDefault The default type of values if not overridden on operations.
 */
declare class AbstractLevel<TFormat, KDefault = string, VDefault = string>
  extends EventEmitter {
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
   * A read-only string property that is one of:
   *
   * - `'opening'` - waiting for the database to be opened
   * - `'open'` - successfully opened the database
   * - `'closing'` - waiting for the database to be closed
   * - `'closed'` - successfully closed the database.
   */
  get status (): 'opening' | 'open' | 'closing' | 'closed'

  /**
   * Open the database.
   */
  open (): Promise<void>
  open (options: AbstractOpenOptions): Promise<void>
  open (callback: NodeCallback<void>): void
  open (options: AbstractOpenOptions, callback: NodeCallback<void>): void

  /**
   * Close the database.
   */
  close (): Promise<void>
  close (callback: NodeCallback<void>): void

  /**
   * Get a value from the database by {@link key}.
   */
  get (key: KDefault): Promise<VDefault>
  get (key: KDefault, callback: NodeCallback<VDefault>): void

  get<K = KDefault, V = VDefault> (
    key: K,
    options: AbstractGetOptions<K, V>
  ): Promise<V>

  get<K = KDefault, V = VDefault> (
    key: K,
    options: AbstractGetOptions<K, V>,
    callback: NodeCallback<V>
  ): void

  /**
   * Get multiple values from the database by an array of {@link keys}.
   */
  getMany (keys: KDefault[]): Promise<VDefault[]>
  getMany (keys: KDefault[], callback: NodeCallback<VDefault[]>): void

  getMany<K = KDefault, V = VDefault> (
    keys: K[],
    options: AbstractGetManyOptions<K, V>
  ): Promise<V[]>

  getMany<K = KDefault, V = VDefault> (
    keys: K[],
    options: AbstractGetManyOptions<K, V>,
    callback: NodeCallback<V[]>
  ): void

  /**
   * Add a new entry or overwrite an existing entry.
   */
  put (key: KDefault, value: VDefault): Promise<void>
  put (key: KDefault, value: VDefault, callback: NodeCallback<void>): void

  put<K = KDefault, V = VDefault> (
    key: K,
    value: V,
    options: AbstractPutOptions<K, V>
  ): Promise<void>

  put<K = KDefault, V = VDefault> (
    key: K,
    value: V,
    options: AbstractPutOptions<K, V>,
    callback: NodeCallback<void>
  ): void

  /**
   * Delete an entry by {@link key}.
   */
  del (key: KDefault): Promise<void>
  del (key: KDefault, callback: NodeCallback<void>): void

  del<K = KDefault> (
    key: K,
    options: AbstractDelOptions<K>
  ): Promise<void>

  del<K = KDefault> (
    key: K,
    options: AbstractDelOptions<K>,
    callback: NodeCallback<void>
  ): void

  /**
   * Perform multiple _put_ and/or _del_ operations in bulk.
   */
  batch (
    operations: Array<AbstractBatchOperation<KDefault, VDefault>>
  ): Promise<void>

  batch (
    operations: Array<AbstractBatchOperation<KDefault, VDefault>>,
    callback: NodeCallback<void>
  ): void

  batch<K = KDefault, V = VDefault> (
    operations: Array<AbstractBatchOperation<K, V>>,
    options: AbstractBatchOptions<K, V>
  ): Promise<void>

  batch<K = KDefault, V = VDefault> (
    operations: Array<AbstractBatchOperation<K, V>>,
    options: AbstractBatchOptions<K, V>,
    callback: NodeCallback<void>
  ): void

  batch (): AbstractChainedBatch<typeof this, KDefault, VDefault>

  /**
   * Create an iterator.
   */
  iterator (): AbstractIterator<typeof this, KDefault, VDefault>
  iterator<K = KDefault, V = VDefault> (
    options: AbstractIteratorOptions<K, V>
  ): AbstractIterator<typeof this, K, V>

  /**
   * Delete all entries or a range.
   */
  clear (): Promise<void>
  clear (callback: NodeCallback<void>): void
  clear<K = KDefault> (options: AbstractClearOptions<K>): Promise<void>
  clear<K = KDefault> (options: AbstractClearOptions<K>, callback: NodeCallback<void>): void

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
   * Call the function {@link fn} at a later time when {@link status} changes to
   * `'open'` or `'closed'`.
   */
  defer (fn: Function): void

  /**
   * Schedule the function {@link fn} to be called in a next tick of the JavaScript
   * event loop, using a microtask scheduler. It will be called with the provided
   * {@link args}.
   */
  nextTick (fn: Function, ...args: any[]): void
}

export { AbstractLevel }

/**
 * Options for the database constructor.
 */
export interface AbstractDatabaseOptions<K, V>
  extends Omit<AbstractOpenOptions, 'passive'> {
  /**
   * Encoding to use for keys.
   */
  keyEncoding?: string | Transcoder.PartialEncoding<K> | undefined

  /**
   * Encoding to use for values.
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
export interface AbstractGetOptions<K, V> {
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
export interface AbstractGetManyOptions<K, V> {
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
export type AbstractBatchOperation<K, V> =
  AbstractBatchPutOperation<K, V> | AbstractBatchDelOperation<K>

/**
 * A _put_ operation to be committed with the {@link AbstractLevel.batch} method.
 */
export interface AbstractBatchPutOperation<K, V> {
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
}

/**
 * A _del_ operation to be committed with the {@link AbstractLevel.batch} method.
 */
export interface AbstractBatchDelOperation<K> {
  type: 'del'
  key: K

  /**
   * Custom key encoding for this _del_ operation, used to encode the {@link key}.
   */
  keyEncoding?: string | Transcoder.PartialEncoding<K> | undefined
}

/**
 * Options for the {@link AbstractLevel.clear} method.
 */
export interface AbstractClearOptions<K> extends RangeOptions<K> {
  /**
   * Custom key encoding for this operation, used to encode range options.
   */
  keyEncoding?: string | Transcoder.PartialEncoding<K> | undefined
}
