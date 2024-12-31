import { AbstractResource } from './interfaces'

/**
 * A lightweight token that represents a version of a database at a particular point in
 * time.
 */
export class AbstractSnapshot implements AbstractResource {
  /**
   * Increment reference count, to register work that should delay closing until
   * {@link unref} is called an equal amount of times. The promise that will be returned
   * by {@link close} will not resolve until the reference count returns to 0. This
   * prevents prematurely closing underlying resources while the snapshot is in use.
   */
  ref (): void

  /**
   * Decrement reference count, to indicate that the work has finished.
   */
  unref (): void

  /**
   * Close the snapshot.
   */
  close (): Promise<void>

  /**
   * Close the snapshot.
   */
  [Symbol.asyncDispose](): Promise<void>
}
