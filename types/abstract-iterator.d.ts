import * as Transcoder from 'level-transcoder'
import { RangeOptions, AdditionalOptions, NodeCallback } from './interfaces'

export interface IteratorOptions<K, V> extends RangeOptions<K>, AdditionalOptions {
  /**
   * Whether to return the key of each entry. Defaults to `true`. If set to `false`,
   * the iterator will yield keys with a value of `undefined`.
   */
  keys?: boolean | undefined

  /**
   * Whether to return the value of each entry. Defaults to `true`. If set to
   * `false`, the iterator will yield values with a value of `undefined`.
   */
  values?: boolean | undefined

  /**
   * Custom key encoding for this iterator, used to encode range options, to encode
   * {@link AbstractIterator.seek} targets and to decode keys.
   */
  keyEncoding?: string | Transcoder.PartialEncoding<K> | undefined

  /**
   * Custom value encoding for this iterator, used to decode values.
   */
  valueEncoding?: string | Transcoder.PartialDecoder<V> | undefined
}

export class AbstractIterator<TDatabase, K, V> {
  constructor (db: TDatabase, options: IteratorOptions<K, V>)

  /**
   * A reference to the database that created this iterator.
   */
  db: TDatabase

  /**
   * Advance the iterator to the next key and yield the entry at that key. When
   * possible, prefer to use [`for await...of`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/for-await...of)
   * instead.
   */
  next (): Promise<[K, V]>
  next (callback: NextCallback<K, V>): void

  /**
   * Seek the iterator to a given key or the closest key. Subsequent calls to {@link next}
   * (including implicit calls in a `for await...of` loop) will yield entries with
   * keys equal to or larger than {@link target}, or equal to or smaller than {@link target}
   * if the {@link IteratorOptions.reverse} option was true.
   */
  seek (target: K): void
  seek<TTarget = K> (target: TTarget, options: SeekOptions<TTarget>): void

  /**
   * Free up underlying resources. Not necessary to call if [`for await...of`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/for-await...of)
   * is used.
   */
  close (): Promise<void>
  close (callback: NodeCallback<void>): void

  [Symbol.asyncIterator] (): AsyncGenerator<[K, V], void, unknown>
}

/**
 * Options for the {@link AbstractIterator.seek} method.
 */
export interface SeekOptions<K> {
  /**
   * Custom key encoding, used to encode the `target`. By default the
   * {@link IteratorOptions.keyEncoding} option of the iterator is used, or (if that
   * wasn't set) the keyEncoding of the database.
   */
  keyEncoding?: string | Transcoder.PartialEncoder<K> | undefined
}

declare type NextCallback<K, V> =
  (err: Error | undefined | null, key?: K | undefined, value?: V | undefined) => void
