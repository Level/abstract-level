import * as Transcoder from 'level-transcoder'
import { NodeCallback, AdditionalOptions } from './interfaces'

export class AbstractChainedBatch<TDatabase, KDefault, VDefault> {
  constructor (db: TDatabase)

  /**
   * A reference to the database that created this chained batch.
   */
  db: TDatabase

  /**
   * The number of queued operations on the current batch.
   */
  get length (): number

  /**
   * Queue a _put_ operation on this batch, not committed until {@link write} is
   * called.
   */
  put (key: KDefault, value: VDefault): this

  put<K = KDefault, V = VDefault> (
    key: K,
    value: V,
    options: ChainedBatchPutOptions<K, V>
  ): this

  /**
   * Queue a _del_ operation on this batch, not committed until {@link write} is
   * called.
   */
  del (key: KDefault): this
  del<K = KDefault> (key: K, options: ChainedBatchDelOptions<K>): this

  /**
   * Clear all queued operations on this batch.
   */
  clear (): this

  /**
   * Commit the queued operations for this batch. All operations will be written
   * atomically, that is, they will either all succeed or fail with no partial
   * commits.
   */
  write (): Promise<void>
  write (options: ChainedBatchWriteOptions): Promise<void>
  write (callback: NodeCallback<void>): void
  write (options: ChainedBatchWriteOptions, callback: NodeCallback<void>): void

  /**
   * Free up underlying resources. This should be done even if the chained batch has
   * zero queued operations. Automatically called by {@link write} so normally not
   * necessary to call, unless the intent is to discard a chained batch without
   * committing it.
   */
  close (): Promise<void>
  close (callback: NodeCallback<void>): void
}

/**
 * Options for the {@link AbstractChainedBatch.put} method.
 */
export interface ChainedBatchPutOptions<K, V> extends AdditionalOptions {
  /**
   * Custom key encoding for this _put_ operation, used to encode the `key`.
   */
  keyEncoding?: string | Transcoder.PartialEncoder<K> | undefined

  /**
   * Custom value encoding for this _put_ operation, used to encode the `value`.
   */
  valueEncoding?: string | Transcoder.PartialEncoder<V> | undefined
}

/**
 * Options for the {@link AbstractChainedBatch.del} method.
 */
export interface ChainedBatchDelOptions<K> extends AdditionalOptions {
  /**
   * Custom key encoding for this _del_ operation, used to encode the `key`.
   */
  keyEncoding?: string | Transcoder.PartialEncoder<K> | undefined
}

/**
 * Options for the {@link AbstractChainedBatch.write} method.
 */
export interface ChainedBatchWriteOptions extends AdditionalOptions {
  // There are no options by default.
}
