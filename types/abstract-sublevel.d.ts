import * as Transcoder from 'level-transcoder'
import { AbstractLevel } from './abstract-level'

/**
 * @template TDatabase Type of parent database.
 * @template TFormat The type used internally by the parent database to store data.
 * @template KDefault The default type of keys if not overridden on operations.
 * @template VDefault The default type of values if not overridden on operations.
 */
declare class AbstractSublevel<TDatabase, TFormat, KDefault, VDefault>
  extends AbstractLevel<TFormat, KDefault, VDefault> {
  /**
   * Sublevel constructor.
   *
   * @param db Parent database.
   * @param name Name of the sublevel, used to prefix keys.
   */
  constructor (
    db: TDatabase,
    name: string,
    options?: AbstractSublevelOptions<KDefault, VDefault> | undefined
  )

  /**
   * Prefix of the sublevel. A read-only string property.
   */
  get prefix (): string

  /**
   * Get the path of the sublevel, which is its prefix without separators.
   *
   * @param local If true, exclude path of parent database. If false (the default) then
   * recurse to form a fully-qualified path that travels from the root database to this
   * sublevel.
   */
  path (local?: boolean | undefined): string[]

  /**
   * Parent database. A read-only property.
   */
  get parent (): TDatabase

  /**
   * Root database. A read-only property.
   */
  get db (): AbstractLevel<any, any, any>
}

/**
 * Options for the {@link AbstractLevel.sublevel} method.
 */
export interface AbstractSublevelOptions<K, V> {
  /**
   * Character for separating sublevel names from user keys and each other. Must sort
   * before characters used in `name`. An error will be thrown if that's not the case.
   *
   * @defaultValue `'!'`
   */
  separator?: string | undefined

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
