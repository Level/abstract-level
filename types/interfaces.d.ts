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
