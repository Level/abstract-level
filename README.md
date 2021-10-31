# abstract-level

**Abstract prototype for a lexicographically sorted key-value database, with a [public API](#public-api-for-consumers) for consumers and a [private API](#private-api-for-implementors) for concrete implementations.** The (not yet official) successor to `abstract-leveldown`.

[![level badge][level-badge]](https://github.com/Level/awesome)
[![Standard](https://img.shields.io/badge/standard-informational?logo=javascript&logoColor=fff)](https://standardjs.com)
[![Common Changelog](https://common-changelog.org/badge.svg)](https://common-changelog.org)
[![Donate](https://img.shields.io/badge/donate-orange?logo=open-collective&logoColor=fff)](https://opencollective.com/level)

## Table of Contents

<details><summary>Click to expand</summary>

- [Usage](#usage)
- [Supported Platforms](#supported-platforms)
- [Public API For Consumers](#public-api-for-consumers)
  - [`db = constructor(...[, options])`](#db--constructor-options)
  - [`db.status`](#dbstatus)
  - [`db.open([options][, callback])`](#dbopenoptions-callback)
  - [`db.close([callback])`](#dbclosecallback)
  - [`db.supports`](#dbsupports)
  - [`db.get(key[, options][, callback])`](#dbgetkey-options-callback)
  - [`db.getMany(keys[, options][, callback])`](#dbgetmanykeys-options-callback)
  - [`db.put(key, value[, options][, callback])`](#dbputkey-value-options-callback)
  - [`db.del(key[, options][, callback])`](#dbdelkey-options-callback)
  - [`db.batch(operations[, options][, callback])`](#dbbatchoperations-options-callback)
  - [`db.batch()`](#dbbatch)
  - [`db.iterator([options])`](#dbiteratoroptions)
  - [`db.clear([options][, callback])`](#dbclearoptions-callback)
  - [`encoding = db.keyEncoding([encoding]`](#encoding--dbkeyencodingencoding)
  - [`encoding = db.valueEncoding([encoding])`](#encoding--dbvalueencodingencoding)
  - [`chainedBatch`](#chainedbatch)
    - [`chainedBatch.put(key, value[, options])`](#chainedbatchputkey-value-options)
    - [`chainedBatch.del(key[, options])`](#chainedbatchdelkey-options)
    - [`chainedBatch.clear()`](#chainedbatchclear)
    - [`chainedBatch.write([options][, callback])`](#chainedbatchwriteoptions-callback)
    - [`chainedBatch.length`](#chainedbatchlength)
    - [`chainedBatch.db`](#chainedbatchdb)
  - [`iterator`](#iterator)
    - [`for await...of iterator`](#for-awaitof-iterator)
    - [`iterator.next([callback])`](#iteratornextcallback)
    - [`iterator.seek(target[, options])`](#iteratorseektarget-options)
    - [`iterator.close([callback])`](#iteratorclosecallback)
    - [`iterator.db`](#iteratordb)
  - [Encodings](#encodings)
  - [Events](#events)
  - [Errors](#errors)
    - [`LEVEL_NOT_FOUND`](#level_not_found)
    - [`LEVEL_DATABASE_NOT_OPEN`](#level_database_not_open)
    - [`LEVEL_DATABASE_NOT_CLOSED`](#level_database_not_closed)
    - [`LEVEL_ITERATOR_NOT_OPEN`](#level_iterator_not_open)
    - [`LEVEL_ITERATOR_BUSY`](#level_iterator_busy)
    - [`LEVEL_BATCH_NOT_OPEN`](#level_batch_not_open)
    - [`LEVEL_ENCODING_NOT_FOUND`](#level_encoding_not_found)
    - [`LEVEL_ENCODING_NOT_SUPPORTED`](#level_encoding_not_supported)
    - [`LEVEL_DECODE_ERROR`](#level_decode_error)
    - [`LEVEL_INVALID_KEY`](#level_invalid_key)
    - [`LEVEL_INVALID_VALUE`](#level_invalid_value)
    - [`LEVEL_CORRUPTION`](#level_corruption)
    - [`LEVEL_NOT_SUPPORTED`](#level_not_supported)
    - [`LEVEL_LEGACY`](#level_legacy)
- [Private API For Implementors](#private-api-for-implementors)
  - [Example](#example)
  - [`db = AbstractLevel(manifest[, options])`](#db--abstractlevelmanifest-options)
  - [`db._open(options, callback)`](#db_openoptions-callback)
  - [`db._close(callback)`](#db_closecallback)
  - [`db._get(key, options, callback)`](#db_getkey-options-callback)
  - [`db._getMany(keys, options, callback)`](#db_getmanykeys-options-callback)
  - [`db._put(key, value, options, callback)`](#db_putkey-value-options-callback)
  - [`db._del(key, options, callback)`](#db_delkey-options-callback)
  - [`db._batch(operations, options, callback)`](#db_batchoperations-options-callback)
  - [`db._chainedBatch()`](#db_chainedbatch)
  - [`db._iterator(options)`](#db_iteratoroptions)
  - [`db._clear(options, callback)`](#db_clearoptions-callback)
  - [`iterator = AbstractIterator(db)`](#iterator--abstractiteratordb)
    - [`iterator._next(callback)`](#iterator_nextcallback)
    - [`iterator._seek(target, options)`](#iterator_seektarget-options)
    - [`iterator._close(callback)`](#iterator_closecallback)
  - [`chainedBatch = AbstractChainedBatch(db)`](#chainedbatch--abstractchainedbatchdb)
    - [`chainedBatch._put(key, value, options)`](#chainedbatch_putkey-value-options)
    - [`chainedBatch._del(key, options)`](#chainedbatch_delkey-options)
    - [`chainedBatch._clear()`](#chainedbatch_clear)
    - [`chainedBatch._write(options, callback)`](#chainedbatch_writeoptions-callback)
- [Differences from `level(up)`](#differences-from-levelup)
- [Test Suite](#test-suite)
  - [Excluding tests](#excluding-tests)
  - [Reusing `testCommon`](#reusing-testcommon)
- [Spread The Word](#spread-the-word)
- [Install](#install)
- [Contributing](#contributing)
- [Big Thanks](#big-thanks)
- [Donate](#donate)
- [License](#license)

</details>

## Usage

Typical usage of an implementation looks like this:

```js
// Create a database
const db = level({ valueEncoding: 'json' })

// Add an entry with key 'a' and value 1
await db.put('a', 1)

// Add multiple entries
await db.batch([{ type: 'put', key: 'b', value: 2 }])

// Get value of key 'a': 1
const value = await db.get('a')

// Iterate entries with keys that are greater than 'b'
for await (const [key, value] of db.iterator({ gt: 'b' })) {
  console.log(value) // 2
}
```

## Supported Platforms

We aim to support Active LTS and Current Node.js releases as well as browsers. Supported environments may differ per implementation. The following browsers are supported and continuously tested:

[![Sauce Test Status](https://app.saucelabs.com/browser-matrix/abstract-leveldown.svg)](https://app.saucelabs.com/u/abstract-leveldown)

## Public API For Consumers

_If you are upgrading: please see [UPGRADING.md](UPGRADING.md)._

### `db = constructor(...[, options])`

The signature of this function is implementation-specific but all should have an `options` argument as the last. Typically, constructors take a `location` as their first argument, pointing to where the data will be stored. That may be a file path, URL, something else or none at all, since not all implementations are disk-based or persistent. Others take another database rather than a location as their first argument.

The optional `options` object may contain:

- `keyEncoding` (string or object, default `'utf8'`): encoding to use for keys
- `valueEncoding` (string or object, default `'utf8'`): encoding to use for values.

See [Encodings](#encodings) for a full description of these options. Other `options` (except the `passive` option) are forwarded to `db.open()` which is automatically called. Any read & write operations are queued internally until the database has finished opening. If opening fails, those queued operations will yield errors.

### `db.status`

A read-only property. A database can be in one of the following states:

- `'opening'` - waiting for the database to be opened
- `'open'` - successfully opened the database
- `'closing'` - waiting for the database to be closed
- `'closed'` - database has been successfully closed, should not be used.

### `db.open([options][, callback])`

Open the database. The `callback` function will be called with no arguments when successfully opened, or with a single error argument if opening failed. If no callback is provided, a promise is returned. Options passed to `open()` take precedence over options passed to the constructor. Not all implementations support the `createIfMissing` and `errorIfExists` options (notably `memdown` and `level-js`).

The optional `options` object may contain:

- `createIfMissing` (boolean, default: `true`): If `true`, create an empty database if one doesn't already exist. If `false` and the database doesn't exist, opening will fail.
- `errorIfExists` (boolean, default: `false`): If `true` and the database already exists, opening will fail.
- `passive` (boolean, default: `false`): Wait for, but do not initiate, opening of the database.

In general it's not necessary to call this method directly as it's automatically called by the constructor. However, it is possible to reopen the database after it has been closed with [`close()`](#dbclosecallback). Once `open()` has then been called, any read & write operations will again be queued internally until opening finished.

The `open()` and `close()` methods are idempotent. If the database is already open, the `callback` will be called in a next tick. If opening is already in progress, the `callback` will be called when that completes. If closing is in progress, the database will be reopened once closing completes. Likewise, if `close()` is called before opening completes, the database will be closed once opening completes and the `callback` will receive an error.

### `db.close([callback])`

Close the database. The `callback` function will be called with no arguments if closing succeeded or with a single `error` argument if closing failed. If no callback is provided, a promise is returned.

A database may have associated resources like file handles and locks. When you no longer need the database (for the remainder of your program) call `close()` to free up resources.

### `db.supports`

A read-only [manifest](https://github.com/Level/supports). Might be used like so:

```js
if (!db.supports.permanence) {
  throw new Error('Persistent storage is required')
}

if (db.supports.encodings.buffer) {
  await db.put(Buffer.from('key'), 'value')
}
```

### `db.get(key[, options][, callback])`

Get a value from the database by `key`. The optional `options` object may contain:

- `keyEncoding`: custom key encoding for this operation, used to encode the `key`.
- `valueEncoding`: custom value encoding for this operation, used to decode the value.

The `callback` function will be called with an error if the operation failed. If the key was not found, the error will have code [`LEVEL_NOT_FOUND`](#errors). If successful the first argument will be `null` and the second argument will be the value. If no callback is provided, a promise is returned.

### `db.getMany(keys[, options][, callback])`

Get multiple values from the database by an array of `keys`. The optional `options` object may contain:

- `keyEncoding`: custom key encoding for this operation, used to encode the `keys`.
- `valueEncoding`: custom value encoding for this operation, used to decode values.

The `callback` function will be called with an error if the operation failed. If successful the first argument will be `null` and the second argument will be an array of values with the same order as `keys`. If a key was not found, the relevant value will be `undefined`. If no callback is provided, a promise is returned.

### `db.put(key, value[, options][, callback])`

Add a new entry or overwrite an existing entry. The optional `options` object may contain:

- `keyEncoding`: custom key encoding for this operation, used to encode the `key`.
- `valueEncoding`: custom value encoding for this operation, used to encode the `value`.

The `callback` function will be called with no arguments if the operation was successful or with an error if it failed. If no callback is provided, a promise is returned.

### `db.del(key[, options][, callback])`

Delete an entry by `key`. The optional `options` object may contain:

- `keyEncoding`: custom key encoding for this operation, used to encode the `key`.

The `callback` function will be called with no arguments if the operation was successful or with an error if it failed. If no callback is provided, a promise is returned.

### `db.batch(operations[, options][, callback])`

Perform multiple _put_ and/or _del_ operations in bulk. The `operations` argument must be an `Array` containing a list of operations to be executed sequentially, although as a whole they are performed as an atomic operation.

Each operation is contained in an object having the following properties: `type`, `key`, `value`, where the `type` is either `'put'` or `'del'`. In the case of `'del'` the `value` property is ignored.

The optional `options` object may contain:

- `keyEncoding`: custom key encoding for this batch.
- `valueEncoding`: custom value encoding for this batch.

These options can also be set on individual operation objects, taking precedence. The `callback` function will be called with no arguments if the batch was successful or with an error if it failed. If no callback is provided, a promise is returned.

### `db.batch()`

Returns a [`chainedBatch`](#chainedbatch).

### `db.iterator([options])`

Returns an [`iterator`](#iterator). Accepts the following range options:

- `gt` (greater than), `gte` (greater than or equal) define the lower bound of the range to be iterated. Only entries where the key is greater than (or equal to) this option will be included in the range. When `reverse=true` the order will be reversed, but the entries iterated will be the same.
- `lt` (less than), `lte` (less than or equal) define the higher bound of the range to be iterated. Only entries where the key is less than (or equal to) this option will be included in the range. When `reverse=true` the order will be reversed, but the entries iterated will be the same.
- `reverse` (boolean, default: `false`): iterate entries in reverse order. Beware that a reverse seek can be slower than a forward seek.
- `limit` (number, default: `-1`): limit the number of entries collected by this iterator. This number represents a _maximum_ number of entries and may not be reached if you get to the end of the range first. A value of `-1` means there is no limit. When `reverse=true` the entries with the highest keys will be returned instead of the lowest keys.

In addition to range options, `iterator()` takes the following options:

- `keys` (boolean, default: `true`): whether to return the key of each entry. If set to `false`, calls to `iterator.next(callback)` will yield keys with a value of `undefined`.
- `values` (boolean, default: `true`): whether to return the value of each entry. If set to `false`, calls to `iterator.next(callback)` will yield values with a value of `undefined`.
- `keyEncoding`: custom key encoding for this iterator, used to encode range options, to encode `seek()` targets and to decode keys.
- `valueEncoding`: custom value encoding for this iterator, used to decode values.

Lastly, an implementation is free to add its own options.

### `db.clear([options][, callback])`

Delete all entries or a range. Not guaranteed to be atomic. Accepts the following options (with the same rules as on iterators):

- `gt` (greater than), `gte` (greater than or equal) define the lower bound of the range to be deleted. Only entries where the key is greater than (or equal to) this option will be included in the range. When `reverse=true` the order will be reversed, but the entries deleted will be the same.
- `lt` (less than), `lte` (less than or equal) define the higher bound of the range to be deleted. Only entries where the key is less than (or equal to) this option will be included in the range. When `reverse=true` the order will be reversed, but the entries deleted will be the same.
- `reverse` (boolean, default: `false`): delete entries in reverse order. Only effective in combination with `limit`, to remove the last N records.
- `limit` (number, default: `-1`): limit the number of entries to be deleted. This number represents a _maximum_ number of entries and may not be reached if you get to the end of the range first. A value of `-1` means there is no limit. When `reverse=true` the entries with the highest keys will be deleted instead of the lowest keys.
- `keyEncoding`: custom key encoding for this operation, used to encode range options.

If no options are provided, all entries will be deleted. The `callback` function will be called with no arguments if the operation was successful or with an error if it failed. If no callback is provided, a promise is returned.

### `encoding = db.keyEncoding([encoding]`

Returns the given `encoding` argument as a normalized encoding object that follows the [`level-transcoder`](https://github.com/Level/transcoder) encoding interface. See [Encodings](#encodings) for an introduction. The `encoding` argument may be:

- A string to select a known encoding by its name
- An object that follows one of the following interfaces: [`level-transcoder`](https://github.com/Level/transcoder#encoding-interface), [`level-codec`](https://github.com/Level/codec#encoding-format), [`codecs`](https://github.com/mafintosh/codecs), [`abstract-encoding`](https://github.com/mafintosh/abstract-encoding), [`multiformats`](https://github.com/multiformats/js-multiformats/blob/master/src/codecs/interface.ts)
- A previously normalized encoding, such that `keyEncoding(x)` equals `keyEncoding(keyEncoding(x))`
- Omitted, `null` or `undefined`, in which case the default `keyEncoding` of the database is returned.

Other methods that take `keyEncoding` or `valueEncoding` options, accept the same as above. Results are cached. If the `encoding` argument is an object and it has a name then subsequent calls can refer to that encoding by name.

Depending on the encodings supported by a database, this method may return a _transcoder encoding_ that translates the desired encoding from / to an encoding supported by the database. Its `encode()` and `decode()` methods will have respectively the same input and output types as a non-transcoded encoding, but its `name` property will differ.

Assume that e.g. `db.keyEncoding().encode(key)` is safe to call at any time including if the database isn't open, because encodings must be stateless. If the given encoding is not found or supported, a [`LEVEL_ENCODING_NOT_FOUND` or `LEVEL_ENCODING_NOT_SUPPORTED` error](#errors) is thrown.

### `encoding = db.valueEncoding([encoding])`

Same as `db.keyEncoding([encoding])` except that it returns the default `valueEncoding` of the database (if the `encoding` argument is omitted, `null` or `undefined`).

### `chainedBatch`

#### `chainedBatch.put(key, value[, options])`

Queue a `put` operation on this batch. This may throw if `key` or `value` is invalid. The optional `options` object may contain:

- `keyEncoding`: custom key encoding for this operation, used to encode the `key`.
- `valueEncoding`: custom value encoding for this operation, used to encode the `value`.

#### `chainedBatch.del(key[, options])`

Queue a `del` operation on this batch. This may throw if `key` is invalid. The optional `options` object may contain:

- `keyEncoding`: custom key encoding for this operation, used to encode the `key`.

#### `chainedBatch.clear()`

Clear all queued operations on this batch.

#### `chainedBatch.write([options][, callback])`

Commit the queued operations for this batch. All operations will be written atomically, that is, they will either all succeed or fail with no partial commits.

There are no `options` by default but implementations may add theirs. Note that `write()` does not take encoding options. Those can only be set on `put()` and `del()` because implementations may synchronously forward such calls to an underlying store and thus need keys and values to be encoded at that point.

The `callback` function will be called with no arguments if the batch was successful or with an error if it failed. If no callback is provided, a promise is returned.

After `write()` has been called, no further operations are allowed.

#### `chainedBatch.length`

The number of queued operations on the current batch.

#### `chainedBatch.db`

A reference to the database that created this chained batch.

### `iterator`

An iterator allows you to _iterate_ the entire database or a range. It operates on a snapshot of the database, created at the time `db.iterator()` was called. This means reads on the iterator are unaffected by simultaneous writes. Most but not all implementations can offer this guarantee, which is indicated by `db.supports.snapshots`.

Iterators can be consumed with [`for await...of`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/for-await...of) or by manually calling `iterator.next()` in succession. In the latter mode, `iterator.close()` must always be called. In contrast, finishing, throwing or breaking from a `for await...of` loop automatically calls `iterator.close()`.

An iterator reaches its natural end in the following situations:

- The end of the database has been reached
- The end of the range has been reached
- The last `iterator.seek()` was out of range.

An iterator keeps track of when a `next()` is in progress and when an `close()` has been called so it doesn't allow concurrent `next()` calls, it does allow `close()` while a `next()` is in progress and it doesn't allow `next()` after `close()` has been called.

#### `for await...of iterator`

Yields arrays containing a `key` and `value`. The type of `key` and `value` depends on the options passed to `db.iterator()`.

```js
try {
  for await (const [key, value] of db.iterator()) {
    console.log(key)
  }
} catch (err) {
  console.error(err)
}
```

Note for implementors: this uses `iterator.next()` and `iterator.close()` under the hood so no further method implementations are needed to support `for await...of`.

#### `iterator.next([callback])`

Advance the iterator and yield the entry at that key. If an error occurs, the `callback` function will be called with an error. Otherwise, the `callback` receives `null`, a `key` and a `value`. The type of `key` and `value` depends on the options passed to `db.iterator()`. If the iterator has reached its natural end, both `key` and `value` will be `undefined`.

If no callback is provided, a promise is returned for either an array (containing a `key` and `value`) or `undefined` if the iterator reached its natural end.

**Note:** Always call `iterator.close()`, even if you received an error and even if the iterator reached its natural end.

#### `iterator.seek(target[, options])`

Seek the iterator to a given key or the closest key. Subsequent calls to `iterator.next()` (including implicit calls in a `for await...of` loop) will yield entries with keys equal to or larger than `target`, or equal to or smaller than `target` if the `reverse` option passed to `db.iterator()` was true.

The optional `options` object may contain:

- `keyEncoding`: custom key encoding, used to encode the `target`. By default the `keyEncoding` option of the iterator is used or (if that wasn't set) the `keyEncoding` of the database.

If range options like `gt` were passed to `db.iterator()` and `target` does not fall within that range, the iterator will reach its natural end.

**Note:** Not all implementations support `seek()`. Consult `db.supports.seek` or the [support matrix](https://github.com/Level/supports#seek-boolean).

#### `iterator.close([callback])`

Free up underlying resources. The `callback` function will be called with no arguments. If no callback is provided, a promise is returned.

#### `iterator.db`

A reference to the database that created this iterator.

### Encodings

Any method that takes a `key` argument, `value` argument or range options like `gte`, hereby jointly referred to as `data`, runs that `data` through an _encoding_. This means to encode input `data` and decode output `data`.

Several encodings are builtin courtesy of [`level-transcoder`](https://github.com/Level/transcoder) and can be selected by a short name like `utf8` or `json`. The default encoding is `utf8` which ensures you'll always get back a string. Encodings can be specified for keys and values independently with `keyEncoding` and `valueEncoding` options, either in the database constructor or per method to apply an encoding selectively. For example:

```js
const db = level('./db', {
  keyEncoding: 'view',
  valueEncoding: 'json'
})

// Use binary keys
const key = Uint8Array.from([1, 2])

// Encode the value with JSON
await db.put(key, { x: 2 })

// Decode the value with JSON. Yields { x: 2 }
const obj = await db.get(key)

// Decode the value with utf8. Yields '{"x":2}'
const str = await db.get(key, { valueEncoding: 'utf8' })
```

The `keyEncoding` and `valueEncoding` options accept a string to select a known encoding by its name, or an object to use a custom encoding like [`charwise`](https://github.com/dominictarr/charwise). See [`keyEncoding()`](#encoding--dbkeyencodingencoding) for details. If a custom encoding is passed to the database constructor, subsequent method calls can refer to that encoding by name. Supported encodings are exposed in the `db.supports` manifest:

```js
const db = level('./db', {
  keyEncoding: require('charwise'),
  valueEncoding: 'json'
})

// Includes builtin and custom encodings
console.log(db.supports.encodings.utf8) // true
console.log(db.supports.encodings.charwise) // true
```

An encoding can both widen and limit the range of `data` types. The default `utf8` encoding can only store strings. Other types, though accepted, are irreversibly stringified before storage. That includes JavaScript primitives which are converted with [`String(x)`](https://tc39.es/ecma262/multipage/text-processing.html#sec-string-constructor-string-value), Buffer which is converted with [`x.toString('utf8')`](https://nodejs.org/api/buffer.html#buftostringencoding-start-end) and Uint8Array converted with [`TextDecoder#decode(x)`](https://developer.mozilla.org/en-US/docs/Web/API/TextDecoder/decode). Use other encodings for a richer set of `data` types, as well as binary data without a conversion cost - or loss of non-unicode bytes.

For binary data two builtin encodings are available: `buffer` and `view`. They use a Buffer or Uint8Array respectively. To some extent these encodings are interchangeable, as the `buffer` encoding also accepts Uint8Array as input `data` (and will convert that to a Buffer without copying the underlying ArrayBuffer), the `view` encoding also accepts Buffer as input `data` and so forth. Output `data` will be either a Buffer or Uint8Array respectively and can also be converted:

```js
const db = level('./db', { valueEncoding: 'view' })
const buffer = await db.get('example', { valueEncoding: 'buffer' })
```

In browser environments it may be preferable to only use `view` in order to reduce JavaScript bundle size, as use of Buffer requires a shim (injected by Webpack, Browserify or other tooling).

Regardless of the choice of encoding, a `key` or `value` may not be `null` or `undefined` due to preexisting significance in iterators and streams. No such restriction exists on range options because `null` and `undefined` are significant types in encodings like [`charwise`](https://github.com/dominictarr/charwise) as well as some underlying stores like IndexedDB. Consumers of an `abstract-level` implementation must assume that range options like `{ gt: undefined }` are _not_ the same as `{}`. The [abstract test suite](#test-suite) does not test these types. Whether they are supported or how they sort may differ per implementation. An implementation can choose to:

- Encode these types to make them meaningful
- Have no defined behavior (moving the concern to a higher level)
- Delegate to an underlying store (moving the concern to a lower level).

Lastly, one way or another, every implementation _must_ support `data` of type String and _should_ support `data` of type Buffer or Uint8Array.

### Events

An `abstract-level` database is an [`EventEmitter`](https://nodejs.org/api/events.html) and emits the following events.

| Event     | Description          | Arguments            |
| :-------- | :------------------- | :------------------- |
| `put`     | Entry was updated    | `key, value` (any)   |
| `del`     | Entry was deleted    | `key` (any)          |
| `batch`   | Batch has executed   | `operations` (array) |
| `clear`   | Entries were deleted | `options` (object)   |
| `opening` | Database is opening  | -                    |
| `open`    | Database has opened  | -                    |
| `closing` | Database is closing  | -                    |
| `closed`  | Database has closed. | -                    |

For example you can do:

```js
db.on('put', function (key, value) {
  console.log('Updated', { key, value })
})
```

Any keys, values and range options in these events are the original arguments passed to the relevant operation that triggered the event, before having encoded them.

### Errors

Errors thrown or yielded from the methods above will have a `code` property that is an uppercase string. Error codes will not change between major versions, but error messages will. Messages may also differ between implementations; they are free and encouraged to tune messages. A database may also throw [`TypeError`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/TypeError) errors (or other core error constructors in JavaScript) without a `code`. Used for invalid arguments and other programming mistakes, so for these no guarantee is given on the stability of their properties.

Error codes will be one of the following.

#### `LEVEL_NOT_FOUND`

When a key was not found.

#### `LEVEL_DATABASE_NOT_OPEN`

When an operation was made on a database while it was closing or closed, or when a database failed to `open()`. Including when `close()` was called in the mean time, thus changing the eventual `status`. The error may have a `cause` property that explains a failure to open:

```js
try {
  await db.open()
} catch (err) {
  console.error(err.code) // 'LEVEL_DATABASE_NOT_OPEN'
  console.error(err.cause) // 'Error: Failed to acquire lock'
}
```

#### `LEVEL_DATABASE_NOT_CLOSED`

When a database failed to `close()`. Including when `open()` was called in the mean time, thus changing the eventual `status`. The error may have a `cause` property that explains a failure to close.

#### `LEVEL_ITERATOR_NOT_OPEN`

When an operation was made on an iterator while it was closing or closed, which may also be the result of the database being closed.

#### `LEVEL_ITERATOR_BUSY`

When `iterator.next()` or `seek()` was called while a previous `next()` call did not yet complete.

#### `LEVEL_BATCH_NOT_OPEN`

When an operation was made on a chained batch while it was closing or closed, which may also be the result of the database being closed or that `write()` was called on the chained batch.

#### `LEVEL_ENCODING_NOT_FOUND`

When a `keyEncoding` or `valueEncoding` option specified a named encoding that does not exist.

#### `LEVEL_ENCODING_NOT_SUPPORTED`

When a `keyEncoding` or `valueEncoding` option specified an encoding that isn't supported by the database.

#### `LEVEL_DECODE_ERROR`

When decoding of keys or values failed. The error _may_ have a [`cause`](https://github.com/tc39/proposal-error-cause) property containing an original error. For example, it might be a [`SyntaxError`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SyntaxError) from an internal [`JSON.parse()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/parse) call:

```js
await db.put('key', 'invalid json', { keyEncoding: 'utf8' })

try {
  const value = await db.get('key', { valueEncoding: 'json' })
} catch (err) {
  console.log(err.code) // 'LEVEL_DECODE_ERROR'
  console.log(err.cause) // 'SyntaxError: Unexpected token i in JSON at position 0'
}
```

#### `LEVEL_INVALID_KEY`

When a key is `null`, `undefined` or (if an implementation deems it so) otherwise invalid.

#### `LEVEL_INVALID_VALUE`

When a value is `null`, `undefined` or (if an implementation deems it so) otherwise invalid.

#### `LEVEL_CORRUPTION`

Data could not be read (from an underlying store) due to a corruption.

#### `LEVEL_NOT_SUPPORTED`

When a module needs a certain feature, typically as indicated by `db.supports`, but that feature is not available on a database argument or other. For example, some kind of plugin may depend on `seek()`:

```js
const ModuleError = require('module-error')

module.exports = function plugin (db) {
  if (!db.supports.seek) {
    throw new ModuleError('Database must support seeking', {
      code: 'LEVEL_NOT_SUPPORTED'
    })
  }

  // ..
}
```

#### `LEVEL_LEGACY`

When a method, option or other property was used that has been removed from the API.

## Private API For Implementors

To implement a `abstract-level` database, extend its prototype and override the private underscored versions of the methods. For example, to implement the public `put()` method, override the private `_put()` method.

Each of the private methods listed below will receive exactly the number and types of arguments described, regardless of what is passed in through the public API. Public methods provide type checking: if a consumer calls `batch(123)` they'll get an error that the first argument must be an array. Optional arguments get sensible defaults: a `get(key)` call translates to `_get(key, options, callback)`.

All callbacks are error-first and must be asynchronous. If an operation within your implementation is synchronous, invoke the callback on a next tick using microtask scheduling. For convenience, instances of `AbstractLevel`, `AbstractIterator` and `AbstractChainedBatch` include a `nextTick(fn, ...args)` method that uses [`process.nextTick()`](https://nodejs.org/api/process.html#processnexttickcallback-args) in Node.js and [`queueMicrotask()`](https://developer.mozilla.org/en-US/docs/Web/API/queueMicrotask) in browsers.

Where possible, the default private methods are sensible noops that do nothing. For example, `_open(callback)` will merely invoke `callback` on a next tick. Other methods have functional defaults. Each method documents whether implementing it is mandatory.

When throwing or yielding an error, prefer using a [known error code](#errors). If new codes are required for your implementation and you wish to use the `LEVEL_` prefix for consistency, feel free to open an issue to discuss. We'll likely want to document those codes here.

### Example

Let's implement a simplistic in-memory database:

```js
const { AbstractLevel } = require('abstract-level')
const ModuleError = require('module-error')

class ExampleLevel extends AbstractLevel {
  // This in-memory example doesn't have a location
  constructor (location, options) {
    // Declare supported encodings
    const encodings = { utf8: true }

    // Call AbstractLevel constructor
    super({ encodings }, options)

    // Create a map to store entries
    this._entries = new Map()
  }

  _open (options, callback) {
    // Here you would open any necessary resources.
    // Use nextTick to be a nice async citizen
    this.nextTick(callback)
  }

  _put (key, value, options, callback) {
    this._entries.set(key, value)
    this.nextTick(callback)
  }

  _get (key, options, callback) {
    const value = this._entries.get(key)

    if (value === undefined) {
      return this.nextTick(callback, new ModuleError(`Key ${key} was not found`, {
        code: 'LEVEL_NOT_FOUND'
      }))
    }

    this.nextTick(callback, null, value)
  }

  _del (key, options, callback) {
    this._entries.delete(key)
    this.nextTick(callback)
  }
}
```

Now we can use our implementation (with either callbacks or promises):

```js
const db = new ExampleLevel()

await db.put('foo', 'bar')
const value = await db.get('foo')

console.log(value) // 'bar'
```

Although our simple implementation only supports `utf8` strings internally, we do get to use [encodings](#encodings) that encode _to_ that. For example, the `json` encoding which encodes to `utf8`:

```js
const db = new ExampleLevel({ valueEncoding: 'json' })
await db.put('foo', { a: 123 })
const value = await db.get('foo')

console.log(value) // { a: 123 }
```

See [`memdown`](https://github.com/Level/memdown/) if you are looking for a complete in-memory implementation.

### `db = AbstractLevel(manifest[, options])`

The constructor. Sets the [`status`](#dbstatus) to `'opening'`. Takes a [manifest](https://github.com/Level/supports) object that `abstract-level` will enrich. At minimum, the manifest must declare which `encodings` are supported in the private API. For example:

```js
class ExampleLevel extends AbstractLevel {
  constructor (location, options) {
    const manifest = {
      encodings: { buffer: true }
    }

    // Call AbstractLevel constructor.
    // Location is not handled by AbstractLevel.
    super(manifest, options)
  }
}
```

Both the public and private API of `abstract-level` are encoding-aware. This means that private methods receive `keyEncoding` and `valueEncoding` options too. Implementations don't need to perform encoding or decoding themselves. Rather, the `keyEncoding` and `valueEncoding` options are lower-level encodings that indicate the type of already-encoded input data or the expected type of yet-to-be-decoded output data. They're one of `'buffer'`, `'view'`, `'utf8'` and always strings in the private API.

If the manifest declared support of `buffer`, then `keyEncoding` and `valueEncoding` will always be `'buffer'`. If the manifest declared support of `utf8` then `keyEncoding` and `valueEncoding` will be `'utf8'`.

For example: a call like `await db.put(key, { x: 2 }, { valueEncoding: 'json' })` will encode the `{ x: 2 }` value and might forward it to the private API as `db._put(key, '{"x":2}', { valueEncoding: 'utf8' }, callback)`. Same for the key (omitted for brevity).

The public API will coerce user input as necessary. If the manifest declared support of `utf8` then `await db.get(24)` will forward that number key as a string: `db._get('24', { keyEncoding: 'utf8', ... }, callback)`. However, this is _not_ true for output: a private API call like `db._get(key, { keyEncoding: 'utf8', valueEncoding: 'utf8' }, callback)` _must_ yield a string value to the callback.

All private methods below that take a `key` argument, `value` argument or range option, will receive that data in encoded form. That includes `iterator._seek()` with its `target` argument. So if the manifest declared support of `buffer` then `db.iterator({ gt: 2 })` translates into `db._iterator({ gt: Buffer.from('2'), ...options })` and `iterator.seek(128)` translates into `iterator._seek(Buffer.from('128'), options)`.

The `AbstractLevel` constructor will add other supported encodings to the public manifest. If the private API only supports `buffer`, the resulting `db.supports.encodings` will nevertheless be as follows because all other encodings can be transcoded to `buffer`:

```js
{ buffer: true, view: true, utf8: true, json: true, ... }
```

Implementations can also declare support of multiple encodings. Keys and values will then be encoded and decoded via the most optimal path. In `leveldown` for example it's (or will be):

```js
super({ encodings: { buffer: true, utf8: true } }, options, callback)
```

This has the benefit that user input needs less conversion steps: if the input is a string then `leveldown` can pass that to its underlying store as-is. Vice versa for output.

### `db._open(options, callback)`

Open the database. The `options` object will always have the following properties: `createIfMissing`, `errorIfExists`. If opening failed, call the `callback` function with an error. Otherwise call `callback` without any arguments.

The default `_open()` is a sensible noop and invokes `callback` on a next tick.

### `db._close(callback)`

Close the database. When this is called, `db.status` will be `'closing'`. If closing failed, call the `callback` function with an error, which resets the `status` to `'open'`. Otherwise call `callback` without any arguments, which sets `status` to `'closed'`. Make an effort to avoid failing, or if it does happen that it is subsequently safe to keep using the database. If the database was never opened or failed to open then `_close()` will not be called.

The default `_close()` is a sensible noop and invokes `callback` on a next tick.

### `db._get(key, options, callback)`

Get a value by `key`. The `options` object will always have the following properties: `keyEncoding` and `valueEncoding`. If the key does not exist, call the `callback` function with an error that has code [`LEVEL_NOT_FOUND`](#errors). Otherwise call `callback` with `null` as the first argument and the value as the second.

The default `_get()` invokes `callback` on a next tick with a `LEVEL_NOT_FOUND` error. It must be overridden.

### `db._getMany(keys, options, callback)`

Get multiple values by an array of `keys`. The `options` object will always have the following properties: `keyEncoding` and `valueEncoding`. If an error occurs, call the `callback` function with an error. Otherwise call `callback` with `null` as the first argument and an array of values as the second. If a key does not exist, set the relevant value to `undefined`.

The default `_getMany()` invokes `callback` on a next tick with an array of values that is equal in length to `keys` and is filled with `undefined`. It must be overridden.

### `db._put(key, value, options, callback)`

Add a new entry or overwrite an existing entry. The `options` object will always have the following properties: `keyEncoding` and `valueEncoding`. If putting failed, call the `callback` function with an error. Otherwise call `callback` without any arguments.

The default `_put()` invokes `callback` on a next tick. It must be overridden.

### `db._del(key, options, callback)`

Delete an entry. The `options` object will always have the following properties: `keyEncoding`. If deletion failed, call the `callback` function with an error. Otherwise call `callback` without any arguments.

The default `_del()` invokes `callback` on a next tick. It must be overridden.

### `db._batch(operations, options, callback)`

Perform multiple _put_ and/or _del_ operations in bulk. The `operations` argument is always an `Array` containing a list of operations to be executed sequentially, although as a whole they should be performed as an atomic operation. The `_batch()` method will not be called if the `operations` array is empty. Each operation is guaranteed to have at least `type`, `key` and `keyEncoding` properties. If the type is `put`, the operation will also have `value` and `valueEncoding` properties. There are no default options but `options` will always be an object. If the batch failed, call the `callback` function with an error. Otherwise call `callback` without any arguments.

The default `_batch()` invokes `callback` on a next tick. It must be overridden.

### `db._chainedBatch()`

The default `_chainedBatch()` returns a functional `AbstractChainedBatch` instance that uses `db._batch(array, options, callback)` under the hood. The prototype is available on the main exports for you to extend. If you want to implement chainable batch operations in a different manner then you should extend `AbstractChainedBatch` and return an instance of this prototype in the `_chainedBatch()` method:

```js
const { AbstractChainedBatch } = require('abstract-level')

class ChainedBatch extends AbstractChainedBatch {
  constructor (db) {
    super(db)
  }
}

class ExampleLevel extends AbstractLevel {
  _chainedBatch () {
    return new ChainedBatch(this)
  }
}
```

### `db._iterator(options)`

The default `_iterator()` returns a noop `AbstractIterator` instance. It must be overridden, by extending `AbstractIterator` (available on the main module exports) and returning an instance of this prototype in the `_iterator(options)` method.

The `options` object will always have the following properties: `reverse`, `keys`, `values`, `limit`, `keyEncoding` and `valueEncoding`.

### `db._clear(options, callback)`

Delete all entries or a range. Does not have to be atomic. It is recommended (and possibly mandatory in the future) to operate on a snapshot so that writes scheduled after a call to `clear()` will not be affected.

Implementations that wrap another database can typically forward the `_clear()` call to that database, having transformed range options if necessary.

The `options` object will always have the following properties: `reverse`, `limit` and `keyEncoding`. If the user passed range options to `db.clear()`, those will be encoded and set in `options`.

### `iterator = AbstractIterator(db)`

The first argument to this constructor must be an instance of your `AbstractLevel` implementation. The constructor will set `iterator.db` which is used (among other things) to access encodings and ensures that `db` will not be garbage collected in case there are no other references to it.

#### `iterator._next(callback)`

Advance the iterator and yield the entry at that key. If nexting failed, call the `callback` function with an error. Otherwise, call `callback` with `null`, a `key` and a `value`.

The default `_next()` invokes `callback` on a next tick. It must be overridden.

#### `iterator._seek(target, options)`

Seek the iterator to a given key or the closest key. The `options` object will always have the following properties: `keyEncoding`. This method is optional. If supported, set `db.supports.seek` to `true` via the manifest passed to the database constructor.

#### `iterator._close(callback)`

Free up underlying resources. This method is guaranteed to only be called once. Once closing is done, call `callback` without any arguments. It is not allowed to yield an error.

The default `_close()` invokes `callback` on a next tick. Overriding is optional.

### `chainedBatch = AbstractChainedBatch(db)`

The first argument to this constructor must be an instance of your `AbstractLevel` implementation. The constructor will set `chainedBatch.db` which is used to access (among other things) encodings and ensures that `db` will not be garbage collected in case there are no other references to it.

#### `chainedBatch._put(key, value, options)`

Queue a `put` operation on this batch. The `options` object will always have the following properties: `keyEncoding` and `valueEncoding`.

#### `chainedBatch._del(key, options)`

Queue a `del` operation on this batch. The `options` object will always have the following properties: `keyEncoding`.

#### `chainedBatch._clear()`

Clear all queued operations on this batch.

#### `chainedBatch._write(options, callback)`

The default `_write` method uses `db._batch`. If the `_write` method is overridden it must atomically commit the queued operations. There are no default options but `options` will always be an object. If committing fails, call the `callback` function with an error. Otherwise call `callback` without any arguments. The `_write()` method will not be called if the chained batch has zero queued operations.

## Differences from `level(up)`

WIP notes:

- The constructor does not take a callback argument. Instead call `db.open()` if you wish to wait for opening (which is not necessary to use the database) or to capture an error.
- Use of `level-errors` has been replaced with [error codes](#errors).

## Test Suite

To prove that your implementation is `abstract-level` compliant, include the abstract test suite in your `test.js` (or similar):

```js
const test = require('tape')
const suite = require('abstract-level/test')
const ExampleLevel = require('.')

suite({
  test,
  factory () {
    return new ExampleLevel()
  }
})
```

The `test` option _must_ be a function that is API-compatible with [`tape`](https://github.com/substack/tape). The `factory` option _must_ be a function that returns a unique and isolated instance of your implementation. The factory will be called many times by the test suite.

If your implementation is disk-based we recommend using [`tempy`](https://github.com/sindresorhus/tempy) (or similar) to create unique temporary directories. Your setup could look something like:

```js
const test = require('tape')
const tempy = require('tempy')
const suite = require('abstract-level/test')
const ExampleLevel = require('.')

suite({
  test,
  factory () {
    return new ExampleLevel(tempy.directory())
  }
})
```

### Excluding tests

As not every implementation can be fully compliant due to limitations of its underlying storage, some tests may be skipped. This must be done via `db.supports` which is set via the constructor. For example, to skip snapshot tests:

```js
const { AbstractLevel } = require('abstract-level')

class ExampleLevel extends AbstractLevel {
  constructor (location, options) {
    super({ snapshots: false }, options)
  }
}
```

This also serves as a signal to users of your implementation.

### Reusing `testCommon`

The input to the test suite is a `testCommon` object. Should you need to reuse `testCommon` for your own (additional) tests, use the included utility to create a `testCommon` with defaults:

```js
const test = require('tape')
const suite = require('abstract-level/test')
const ExampleLevel = require('.')

const testCommon = suite.common({
  test,
  factory () {
    return new ExampleLevel()
  }
})

suite(testCommon)
```

The `testCommon` object will have the `test` and `factory` properties described above, as well as a convenience `supports` property that is lazily copied from a `factory().supports`. You might use it like so:

```js
test('custom test', function (t) {
  const db = testCommon.factory()
  // ..
})

testCommon.supports.seek && test('another test', function (t) {
  const db = testCommon.factory()
  // ..
})
```

## Spread The Word

If you'd like to share your awesome implementation with the world, here's what you might want to do:

- Add an awesome badge to your `README`: `![level badge](https://leveljs.org/img/badge.svg)`
- Publish your awesome module to [npm](https://npmjs.org)
- Send a Pull Request to [Level/awesome](https://github.com/Level/awesome) to advertise your work!

## Install

With [npm](https://npmjs.org) do:

```
npm install abstract-level
```

## Contributing

[`Level/abstract-level`](https://github.com/Level/abstract-level) is an **OPEN Open Source Project**. This means that:

> Individuals making significant and valuable contributions are given commit-access to the project to contribute as they see fit. This project is more like an open wiki than a standard guarded open source project.

See the [Contribution Guide](https://github.com/Level/community/blob/master/CONTRIBUTING.md) for more details.

## Big Thanks

Cross-browser Testing Platform and Open Source ♥ Provided by [Sauce Labs](https://saucelabs.com).

[![Sauce Labs logo](./sauce-labs.svg)](https://saucelabs.com)

## Donate

Support us with a monthly donation on [Open Collective](https://opencollective.com/level) and help us continue our work.

## License

[MIT](LICENSE)

[level-badge]: https://leveljs.org/img/badge.svg
