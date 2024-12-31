import { AbstractLevel } from './abstract-level'
import { AbstractSnapshot } from './abstract-snapshot'

export interface RangeOptions<K> {
  gt?: K
  gte?: K
  lt?: K
  lte?: K
  reverse?: boolean | undefined
  limit?: number | undefined
}

/**
 * Common options for read methods like {@link AbstractLevel.get} and
 * {@link AbstractLevel.iterator}.
 */
export interface AbstractReadOptions {
  /**
   * Explicit snapshot to read from.
   */
  snapshot?: AbstractSnapshot | undefined
}

/**
 * Represents a stateful resource that can be closed.
 */
export interface AbstractResource extends AsyncDisposable {
  /**
   * Close the resource.
   *
   * Note for implementors: if the resource is exposed to the user and can also be closed
   * in an automated fashion - through `db.attachResource()` or other - then the
   * `close()` method should be idempotent such that calling it twice will make no
   * difference.
   */
  close (): Promise<void>

  /**
   * Close the resource. Identical in functionality to {@link close}.
   */
  [Symbol.asyncDispose](): Promise<void>
}
