# abstract-leveldown

> An abstract prototype matching the [`leveldown`][leveldown] API. Useful for extending [`levelup`](https://github.com/Level/levelup) functionality by providing a replacement to `leveldown`.

[![level badge][level-badge]](https://github.com/Level/awesome)
[![npm](https://img.shields.io/npm/v/abstract-leveldown.svg)](https://www.npmjs.com/package/abstract-leveldown)
[![Node version](https://img.shields.io/node/v/abstract-leveldown.svg)](https://www.npmjs.com/package/abstract-leveldown)
[![Test](https://img.shields.io/github/workflow/status/Level/abstract-leveldown/Test?label=test)](https://github.com/Level/abstract-leveldown/actions/workflows/test.yml)
[![Coverage](https://img.shields.io/codecov/c/github/Level/abstract-leveldown?label=&logo=codecov&logoColor=fff)](https://codecov.io/gh/Level/abstract-leveldown)
[![Standard](https://img.shields.io/badge/standard-informational?logo=javascript&logoColor=fff)](https://standardjs.com)
[![Common Changelog](https://common-changelog.org/badge.svg)](https://common-changelog.org)
[![Donate](https://img.shields.io/badge/donate-orange?logo=open-collective&logoColor=fff)](https://opencollective.com/level)

## Table of Contents

<details><summary>Click to expand</summary>

- [Background](#background)
- [Example](#example)
- [Browser Support](#browser-support)
- [Public API For Consumers](#public-api-for-consumers)
  - [`db = constructor(location[, options][, callback])`](#db--constructorlocation-options-callback)
  - [`db.status`](#dbstatus)
  - [`db.supports`](#dbsupports)
  - [`db.open([options, ]callback)`](#dbopenoptions-callback)
  - [`db.close(callback)`](#dbclosecallback)
  - [`db.get(key[, options], callback)`](#dbgetkey-options-callback)
  - [`db.getMany(keys[, options][, callback])`](#dbgetmanykeys-options-callback)
  - [`db.put(key, value[, options], callback)`](#dbputkey-value-options-callback)
  - [`db.del(key[, options], callback)`](#dbdelkey-options-callback)
  - [`db.batch(operations[, options], callback)`](#dbbatchoperations-options-callback)
  - [`db.batch()`](#dbbatch)
  - [`db.iterator([options])`](#dbiteratoroptions)
  - [`db.clear([options, ]callback)`](#dbclearoptions-callback)
  - [`encoding = db.keyEncoding([encoding]`](#encoding--dbkeyencodingencoding)
  - [`encoding = db.valueEncoding([encoding])`](#encoding--dbvalueencodingencoding)
  - [`chainedBatch`](#chainedbatch)
    - [`chainedBatch.put(key, value[, options])`](#chainedbatchputkey-value-options)
    - [`chainedBatch.del(key[, options])`](#chainedbatchdelkey-options)
    - [`chainedBatch.clear()`](#chainedbatchclear)
    - [`chainedBatch.write([options, ]callback)`](#chainedbatchwriteoptions-callback)
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
    - [`LEVEL_INVALID_BATCH`](#level_invalid_batch)
    - [`LEVEL_LEGACY_API`](#level_legacy_api)
- [Private API For Implementors](#private-api-for-implementors)
  - [`db = AbstractLevelDOWN(manifest[, options][, callback])`](#db--abstractleveldownmanifest-options-callback)
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

## Background

This module provides a base prototype for a key-value store. It has a public API for consumers and a private API for implementors. To implement a `abstract-leveldown` compliant store, extend its prototype and override the private underscore versions of the methods. For example, to implement `put()`, override `_put()` on your prototype.

Where possible, the default private methods have sensible _noop_ defaults that essentially do nothing. For example, `_open(callback)` will invoke `callback` on a next tick. Other methods have functional defaults. Each method listed below documents whether implementing it is mandatory.

The private methods are always provided with consistent arguments, regardless of what is passed in through the public API. All public methods provide argument checking: if a consumer calls `batch(123)` they'll get an error that the first argument must be an array.

Where optional arguments are involved, private methods receive sensible defaults: a `get(key, callback)` call translates to `_get(key, options, callback)`. These arguments are documented below.

**If you are upgrading:** please see [UPGRADING.md](UPGRADING.md).

## Example

Let's implement a simplistic in-memory store:

```js
const { AbstractLevelDOWN } = require('abstract-leveldown')

class FakeLevelDOWN {
  // This in-memory example doesn't have a location
  constructor (location, options, callback) {
    // Declare supported encodings
    const encodings = { utf8: true }

    // Call AbstractLevelDOWN constructor
    super({ encodings }, options, callback)

    // Create a map to store entries
    this._entries_ = new Map()
  }

  _open (options, callback) {
    // Here you would open any necessary resources.
    // Use nextTick to be a nice async citizen
    this.nextTick(callback)
  }

  _put (key, value, options, callback) {
    this._entries_.set(key, value)
    this.nextTick(callback)
  }

  _get (key, options, callback) {
    const value = this._entries_.get(key)

    if (value === undefined) {
      // 'NotFound' error, consistent with LevelDOWN API
      return this.nextTick(callback, new Error('NotFound'))
    }

    this.nextTick(callback, null, value)
  }

  _del (key, options, callback) {
    this._entries_.delete(key)
    this.nextTick(callback)
  }
}
```

Now we can use our implementation:

```js
const db = new FakeLevelDOWN()

await db.put('foo', 'bar')
const value = await db.get('foo')

console.log(value) // 'bar'
```

Although our simple implementation only supports `utf8` strings internally, we do get to use [encodings](#encodings) that _encode to_ that. For example, the `json` encoding which encodes to `utf8`:

```js
const db = new FakeLevelDOWN({ valueEncoding: 'json' })
await db.put('foo', { a: 123 })
const value = await db.get('foo')

console.log(value) // { a: 123 }
```

See [`memdown`](https://github.com/Level/memdown/) if you are looking for a complete in-memory implementation.

## Browser Support

[![Sauce Test Status](https://app.saucelabs.com/browser-matrix/abstract-leveldown.svg)](https://app.saucelabs.com/u/abstract-leveldown)

## Public API For Consumers

### `db = constructor(location[, options][, callback])`

Constructors typically take a `location` as their first argument, pointing to where the data will be stored. That may be a file path, URL, something else or `null`, since not all implementations are disk-based or persistent. Some implementations take another db rather than a location as the first argument.

The optional `options` object may contain:

- `keyEncoding` (string or object, default `'utf8'`): encoding to use for keys
- `valueEncoding` (string or object, default `'utf8'`): encoding to use for values.

See the [Encodings section](#encodings) for a full description of these options. Other `options` as well as the `callback` argument (if any) are forwarded to `db.open(options, callback)`.

### `db.status`

A read-only property. An `abstract-leveldown` store can be in one of the following states:

- `'opening'` - waiting for the store to be opened
- `'open'` - successfully opened the store
- `'closing'` - waiting for the store to be closed
- `'closed'` - store has been successfully closed, should not be used.

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

### `db.open([options, ]callback)`

Open the store. The `callback` function will be called with no arguments when the store has been successfully opened, or with a single error argument if the open operation failed for any reason.

The optional `options` argument may contain:

- `createIfMissing` _(boolean, default: `true`)_: If `true` and the store doesn't exist it will be created. If `false` and the store doesn't exist, `callback` will receive an error.
- `errorIfExists` _(boolean, default: `false`)_: If `true` and the store exists, `callback` will receive an error.
- `passive` _(boolean, default: `false`)_: If `true` then the db will wait for, but not initiate, opening of the db.

Options passed to `open()` take precedence over options passed to the constructor. Not all implementations support the `createIfMissing` and `errorIfExists` options (notably `memdown` and `level-js`).

If the store is already open, the `callback` will be called in a next tick. If opening is already in progress, the `callback` will be called when that completes. If closing is in progress, the store will be reopened once closing completes. Likewise, if `db.close()` is called before opening completes, the store will be closed once opening completes and the `callback` will receive an error.

### `db.close(callback)`

Close the store. The `callback` function will be called with no arguments if the operation is successful or with a single `error` argument if closing failed for any reason.

### `db.get(key[, options], callback)`

Get a value from the store by `key`. The optional `options` object may contain:

- `keyEncoding` (string or object): custom key encoding for this operation, used to encode the `key`.
- `valueEncoding` (string or object): custom value encoding for this operation, used to decode the value.

The `callback` function will be called with an `Error` if the operation failed for any reason, including if the key was not found. If successful the first argument will be `null` and the second argument will be the value.

### `db.getMany(keys[, options][, callback])`

Get multiple values from the store by an array of `keys`. The optional `options` object may contain:

- `keyEncoding` (string or object): custom key encoding for this operation, used to encode the `keys`.
- `valueEncoding` (string or object): custom value encoding for this operation, used to decode values.

The `callback` function will be called with an `Error` if the operation failed for any reason. If successful the first argument will be `null` and the second argument will be an array of values with the same order as `keys`. If a key was not found, the relevant value will be `undefined`.

If no callback is provided, a promise is returned.

### `db.put(key, value[, options], callback)`

Store a new entry or overwrite an existing entry. The optional `options` object may contain:

- `keyEncoding` (string or object): custom key encoding for this operation, used to encode the `key`.
- `valueEncoding` (string or object): custom value encoding for this operation, used to encode the `value`.

The `callback` function will be called with no arguments if the operation is successful or with an `Error` if putting failed for any reason.

### `db.del(key[, options], callback)`

Delete an entry. The optional `options` object may contain:

- `keyEncoding` (string or object): custom key encoding for this operation, used to encode the `key`.

The `callback` function will be called with no arguments if the operation is successful or with an `Error` if deletion failed for any reason.

### `db.batch(operations[, options], callback)`

Perform multiple _put_ and/or _del_ operations in bulk. The `operations` argument must be an `Array` containing a list of operations to be executed sequentially, although as a whole they are performed as an atomic operation.

Each operation is contained in an object having the following properties: `type`, `key`, `value`, where the `type` is either `'put'` or `'del'`. In the case of `'del'` the `value` property is ignored.

The optional `options` object may contain:

- `keyEncoding` (string or object): custom key encoding for this batch.
- `valueEncoding` (string or object): custom value encoding for this batch.

These options can also be set on individual operation objects, taking precedence. The `callback` function will be called with no arguments if the batch is successful or with an error if the batch failed for any reason.

### `db.batch()`

Returns a [`chainedBatch`](#chainedbatch).

### `db.iterator([options])`

Returns an [`iterator`](#iterator). Accepts the following range options:

- `gt` (greater than), `gte` (greater than or equal) define the lower bound of the range to be iterated. Only entries where the key is greater than (or equal to) this option will be included in the range. When `reverse=true` the order will be reversed, but the entries iterated will be the same.
- `lt` (less than), `lte` (less than or equal) define the higher bound of the range to be iterated. Only entries where the key is less than (or equal to) this option will be included in the range. When `reverse=true` the order will be reversed, but the entries iterated will be the same.
- `reverse` _(boolean, default: `false`)_: iterate entries in reverse order. Beware that a reverse seek can be slower than a forward seek.
- `limit` _(number, default: `-1`)_: limit the number of entries collected by this iterator. This number represents a _maximum_ number of entries and may not be reached if you get to the end of the range first. A value of `-1` means there is no limit. When `reverse=true` the entries with the highest keys will be returned instead of the lowest keys.

In addition to range options, `iterator()` takes the following options:

- `keys` _(boolean, default: `true`)_: whether to return the key of each entry. If set to `false`, calls to `iterator.next(callback)` will yield keys with a value of `undefined`.
- `values` _(boolean, default: `true`)_: whether to return the value of each entry. If set to `false`, calls to `iterator.next(callback)` will yield values with a value of `undefined`.
- `keyEncoding` (string or object): custom key encoding for this iterator, used to encode range options, to encode `seek()` targets and to decode keys.
- `valueEncoding` (string or object): custom value encoding for this iterator, used to decode values.

Lastly, an implementation is free to add its own options.

### `db.clear([options, ]callback)`

Delete all entries or a range. Not guaranteed to be atomic. Accepts the following options (with the same rules as on iterators):

- `gt` (greater than), `gte` (greater than or equal) define the lower bound of the range to be deleted. Only entries where the key is greater than (or equal to) this option will be included in the range. When `reverse=true` the order will be reversed, but the entries deleted will be the same.
- `lt` (less than), `lte` (less than or equal) define the higher bound of the range to be deleted. Only entries where the key is less than (or equal to) this option will be included in the range. When `reverse=true` the order will be reversed, but the entries deleted will be the same.
- `reverse` _(boolean, default: `false`)_: delete entries in reverse order. Only effective in combination with `limit`, to remove the last N records.
- `limit` _(number, default: `-1`)_: limit the number of entries to be deleted. This number represents a _maximum_ number of entries and may not be reached if you get to the end of the range first. A value of `-1` means there is no limit. When `reverse=true` the entries with the highest keys will be deleted instead of the lowest keys.
- `keyEncoding` (string or object): custom key encoding for this operation, used to encode range options.

If no options are provided, all entries will be deleted. The `callback` function will be called with no arguments if the operation was successful or with an `Error` if it failed for any reason.

### `encoding = db.keyEncoding([encoding]`

Returns the given `encoding` as a normalized encoding object in [`level-transcoder`](https://github.com/Level/transcoder) form. The `encoding` argument may be:

- A string to select a known encoding
- An encoding object in [`level-transcoder`](https://github.com/Level/transcoder) form
- An encoding object in legacy [`level-codec` form](https://github.com/Level/codec#encoding-format)
- A previously normalized encoding, such that `db.keyEncoding(x) === db.keyEncoding(db.keyEncoding(x))`
- Omitted, `null` or `undefined`, in which case the default `keyEncoding` of the db is returned.

Depending on the encodings supported by an implementation, this method may return a _transcoder_ that translates the desired encoding from/to an encoding supported by the implementation. Such a transcoder is an encoding object like usual, of which the `encode()` and `decode()` methods accept the same input types as a non-transcoded encoding, but its `type` property will differ.

Assume that e.g. `db.keyEncoding().encode(key)` is safe to call at any time including if the store hasn't opened yet, because encodings must be stateless. If the given encoding is not found or supported, a [`LEVEL_ENCODING_NOT_FOUND` or `LEVEL_ENCODING_NOT_SUPPORTED` error](#errors) is thrown.

### `encoding = db.valueEncoding([encoding])`

Same as `db.keyEncoding([encoding])` except that it returns the default `valueEncoding` of the db if the `encoding` argument is omitted, `null` or `undefined`.

### `chainedBatch`

#### `chainedBatch.put(key, value[, options])`

Queue a `put` operation on this batch. This may throw if `key` or `value` is invalid. The optional `options` object may contain:

- `keyEncoding` (string or object): custom key encoding for this operation, used to encode the `key`.
- `valueEncoding` (string or object): custom value encoding for this operation, used to encode the `value`.

#### `chainedBatch.del(key[, options])`

Queue a `del` operation on this batch. This may throw if `key` is invalid. The optional `options` object may contain:

- `keyEncoding` (string or object): custom key encoding for this operation, used to encode the `key`.

#### `chainedBatch.clear()`

Clear all queued operations on this batch.

#### `chainedBatch.write([options, ]callback)`

Commit the queued operations for this batch. All operations will be written atomically, that is, they will either all succeed or fail with no partial commits.

There are no `options` by default but implementations may add theirs. Note that `write()` does not take encoding options. Those can only be set on `put()` and `del()` because implementations may synchronously forward such calls to an underlying store and thus need keys and values to be encoded at that point.

The `callback` function will be called with no arguments if the batch is successful or with an `Error` if the batch failed for any reason.

After `write` has been called, no further operations are allowed.

#### `chainedBatch.length`

The number of queued operations on the current batch.

#### `chainedBatch.db`

A reference to the `db` that created this chained batch.

### `iterator`

An iterator allows you to _iterate_ the entire store or a range. It operates on a snapshot of the store, created at the time `db.iterator()` was called. This means reads on the iterator are unaffected by simultaneous writes. Most but not all implementations can offer this guarantee.

Iterators can be consumed with [`for await...of`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/for-await...of) or by manually calling `iterator.next()` in succession. In the latter mode, `iterator.close()` must always be called. In contrast, finishing, throwing or breaking from a `for await...of` loop automatically calls `iterator.close()`.

An iterator reaches its natural end in the following situations:

- The end of the store has been reached
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

Advance the iterator and yield the entry at that key. If an error occurs, the `callback` function will be called with an `Error`. Otherwise, the `callback` receives `null`, a `key` and a `value`. The type of `key` and `value` depends on the options passed to `db.iterator()`. If the iterator has reached its natural end, both `key` and `value` will be `undefined`.

If no callback is provided, a promise is returned for either an array (containing a `key` and `value`) or `undefined` if the iterator reached its natural end.

**Note:** Always call `iterator.close()`, even if you received an error and even if the iterator reached its natural end.

#### `iterator.seek(target[, options])`

Seek the iterator to a given key or the closest key. Subsequent calls to `iterator.next()` (including implicit calls in a `for await...of` loop) will yield entries with keys equal to or larger than `target`, or equal to or smaller than `target` if the `reverse` option passed to `db.iterator()` was true.

The optional `options` object may contain:

- `keyEncoding` (string or object): custom key encoding, used to encode the `target`. By default the `keyEncoding` option of the iterator is used or (if that wasn't set) the `keyEncoding` of the db.

If range options like `gt` were passed to `db.iterator()` and `target` does not fall within that range, the iterator will reach its natural end.

**Note:** Not all implementations support `seek()`. Consult `db.supports.seek` or the [support matrix](https://github.com/Level/supports#seek-boolean).

#### `iterator.close([callback])`

Free up underlying resources. The `callback` function will be called with no arguments.

If no callback is provided, a promise is returned.

#### `iterator.db`

A reference to the `db` that created this iterator.

### Encodings

Any method that takes a `key` argument, `value` argument or range options like `gte`, hereby jointly referred to as `data`, runs that `data` through an _encoding_. This means to encode input `data` and decode output `data`.

Several encodings are builtin courtesy of [`level-transcoder`](https://github.com/Level/transcoder) and can be selected by a short name like `utf8` or `json`. The default encoding is `utf8` which ensures you'll always get back a string. Encodings can be specified for keys and values independently with `keyEncoding` and `valueEncoding` options, either in the db constructor or per method to apply an encoding selectively. For example:

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

The `keyEncoding` and `valueEncoding` options accept a string to select a known encoding by its name, or an object to use a custom encoding like [`charwise`](https://github.com/dominictarr/charwise). If a custom encoding is passed to the db constructor, subsequent method calls can refer to that encoding by name. Supported encodings are exposed in the `db.supports` manifest:

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

Regardless of the choice of encoding, a `key` or `value` may not be `null` or `undefined` due to preexisting significance in iterators and streams. No such restriction exists on range options because `null` and `undefined` are significant types in encodings like [`charwise`](https://github.com/dominictarr/charwise) as well as some underlying stores like IndexedDB. Consumers of an `abstract-leveldown` implementation must assume that range options like `{ gt: undefined }` are _not_ the same as `{}`. The [abstract test suite](#test-suite) does not test these types. Whether they are supported or how they sort may differ per implementation. An implementation can choose to:

- Encode these types to make them meaningful
- Have no defined behavior (moving the concern to a higher level)
- Delegate to an underlying store (moving the concern to a lower level).

Lastly, one way or another, every implementation _must_ support `data` of type String and _should_ support `data` of type Buffer or Uint8Array.

### Events

`abstract-leveldown` is an [`EventEmitter`](https://nodejs.org/api/events.html) and emits the following events.

| Event     | Description          | Arguments            |
| :-------- | :------------------- | :------------------- |
| `put`     | Key has been updated | `key, value` (any)   |
| `del`     | Key has been deleted | `key` (any)          |
| `batch`   | Batch has executed   | `operations` (array) |
| `clear`   | Entries were deleted | `options` (object)   |
| `opening` | Store is opening     | -                    |
| `open`    | Store has opened     | -                    |
| `closing` | Store is closing     | -                    |
| `closed`  | Store has closed.    | -                    |

For example you can do:

```js
db.on('put', function (key, value) {
  console.log('inserted', { key, value })
})
```

Any keys, values and range options in these events are the original arguments passed to the relevant operation that triggered the event, before having encoded them.

### Errors

Most errors have a `code` property. Error codes will not change between major versions, but error messages might. Messages may also differ between implementations; they are free and encouraged to tune messages.

#### `LEVEL_NOT_FOUND`

Not yet implemented. When an entry (a key-value pair) was not found.

#### `LEVEL_DATABASE_NOT_OPEN`

TODO: reevaluate: is it "store" or "database"? Store made sense when we had `levelup`, in the sense that it had an underlying store.

Not yet implemented. When an operation was made on a store while it was closing or closed, or when a store failed to `open()`, including when `close()` was called in the mean time.

#### `LEVEL_DATABASE_NOT_CLOSED`

Not yet implemented. When a store failed to `close()`.

#### `LEVEL_ITERATOR_NOT_OPEN`

Not yet implemented. When an operation was made on an iterator while it was closing or closed, which may also be the result of the store being closed.

#### `LEVEL_ITERATOR_BUSY`

Not yet implemented. When `iterator.next()` or `seek()` was called while a previous `next()` call did not yet complete.

#### `LEVEL_BATCH_NOT_OPEN`

Not yet implemented. When an operation was made on a chained batch while it was closing or closed, which may also be the result of the store being closed or that `write()` was called on the chained batch.

#### `LEVEL_ENCODING_NOT_FOUND`

When a `keyEncoding` or `valueEncoding` option specified a named encoding that does not exist.

#### `LEVEL_ENCODING_NOT_SUPPORTED`

When a `keyEncoding` or `valueEncoding` option specified an encoding that isn't supported by the underlying store.

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

Not yet implemented.

#### `LEVEL_INVALID_VALUE`

Not yet implemented.

#### `LEVEL_INVALID_BATCH`

Not yet implemented. When a `batch()` operation has a `type` property that is not `put` or `del`.

#### `LEVEL_LEGACY_API`

Not yet implemented. When a method, option or other property was used that has been removed from the API.

## Private API For Implementors

Each of these methods will receive exactly the number and order of arguments described. Optional arguments will receive sensible defaults. All callbacks are error-first and must be asynchronous.

If an operation within your implementation is synchronous, be sure to invoke the callback on a next tick using `queueMicrotask`, `process.nextTick` or some other means of microtask scheduling. For convenience, the prototypes of `AbstractLevelDOWN`, `AbstractIterator` and `AbstractChainedBatch` include a `nextTick` method that is compatible with node and browsers.

When throwing or yielding an error, use a known error code (as documented above) when possible. If new codes are required for your implementation and you wish to use the `LEVEL_` prefix for consistency, feel free to open an issue to discuss. We'll likely want to document those codes here.

### `db = AbstractLevelDOWN(manifest[, options][, callback])`

The constructor. Sets the `.status` to `'opening'`. Takes a [manifest](https://github.com/Level/supports) object that `abstract-leveldown` will enrich. At minimum, the manifest must declare which `encodings` are supported in the private API. For example:

```js
class LevelDOWN extends AbstractLevelDOWN {
  constructor (location, options, callback) {
    const manifest = {
      encodings: { buffer: true }
    }

    // Call AbstractLevelDOWN constructor.
    // Location is not handled by AbstractLevelDOWN.
    super(manifest, options, callback)
  }
}
```

Both the public and private API of `abstract-leveldown` are encoding-aware. This means that private methods receive `keyEncoding` and `valueEncoding` options too. Implementations don't need to perform encoding or decoding themselves. Rather, the `keyEncoding` and `valueEncoding` options are lower-level and typically idempotent encodings that specify the type of input data or the expected type of output data.

If the manifest declared support of `buffer`, then `keyEncoding` and `valueEncoding` (which are always strings in the private API) will always be `'buffer'`. If the manifest declared support of `utf8` then `keyEncoding` and `valueEncoding` will always be `'utf8'`.

For example: a call like `await db.put(key, { x: 2 }, { valueEncoding: 'json' })` will encode the `{ x: 2 }` value and might forward it to the private API as `db._put(key, '{"x":2}', { valueEncoding: 'utf8' }, callback)`. Same for the key (omitted for brevity).

The public API will cast and encode user input as necessary. If the manifest declared support of `utf8` then `await db.get(24)` will forward that number key as a string key: `db._get('24', { keyEncoding: 'utf8', ... }, callback)`. However, this is _not_ true for output: a private API call like `db._get(key, { keyEncoding: 'utf8', valueEncoding: 'utf8' }, callback)` _must_ yield a string value to the callback.

All private methods below that take a `key` argument, `value` argument or range option, will receive that data in encoded form. That includes `db._iterator()` with its range options and `iterator._seek()` with its `target` argument. So if the manifest declared support of `buffer` then `db.iterator({ gt: 2 })` translates into `db._iterator({ gt: Buffer.from('2'), ...options })` and `iterator.seek(128)` translates into `iterator._seek(Buffer.from('128'), options)`.

The `AbstractLevelDOWN` constructor will add other supported encodings to the public manifest. If the private API only supports `buffer`, the resulting `db.supports.encodings` will nevertheless be as follows because all other encodings can be transcoded to `buffer`:

```js
{
  buffer: true,
  view: true,
  utf8: true,
  json: true,
  hex: true,
  base64: true
}
```

Implementations can also declare support of multiple encodings; keys and values will then be encoded and decoded via the most optimal path. In `leveldown` for example it's (or will be):

```js
super({ encodings: { buffer: true, utf8: true } }, options, callback)
```

This has the benefit that user input needs less conversion steps: if the input is a string then `leveldown` can pass that to the underlying LevelDB store as-is. Vice versa for output.

### `db._open(options, callback)`

Open the store. The `options` object will always have the following properties: `createIfMissing`, `errorIfExists`. If opening failed, call the `callback` function with an `Error`. Otherwise call `callback` without any arguments.

The default `_open()` is a sensible noop and invokes `callback` on a next tick.

### `db._close(callback)`

Close the store. When this is called, `db.status` will be `'closing'`. If closing failed, call the `callback` function with an `Error`, which resets the `status` to `'open'`. Otherwise call `callback` without any arguments, which sets `status` to `'closed'`. Make an effort to avoid failing, or if it does happen that it is subsequently safe to keep using the store. If the db was never opened or failed to open then `_close()` will not be called.

The default `_close()` is a sensible noop and invokes `callback` on a next tick.

### `db._get(key, options, callback)`

Get a value by `key`. The `options` object will always have the following properties: `keyEncoding` and `valueEncoding`. If the key does not exist, call the `callback` function with a `new Error('NotFound')`. Otherwise call `callback` with `null` as the first argument and the value as the second.

The default `_get()` invokes `callback` on a next tick with a `NotFound` error. It must be overridden.

### `db._getMany(keys, options, callback)`

Get multiple values by an array of `keys`. The `options` object will always have the following properties: `keyEncoding` and `valueEncoding`. If an error occurs, call the `callback` function with an `Error`. Otherwise call `callback` with `null` as the first argument and an array of values as the second. If a key does not exist, set the relevant value to `undefined`.

The default `_getMany()` invokes `callback` on a next tick with an array of values that is equal in length to `keys` and is filled with `undefined`. It must be overridden.

### `db._put(key, value, options, callback)`

Store a new entry or overwrite an existing entry. The `options` object will always have the following properties: `keyEncoding` and `valueEncoding`. If putting failed, call the `callback` function with an `Error`. Otherwise call `callback` without any arguments.

The default `_put()` invokes `callback` on a next tick. It must be overridden.

### `db._del(key, options, callback)`

Delete an entry. The `options` object will always have the following properties: `keyEncoding`. If deletion failed, call the `callback` function with an `Error`. Otherwise call `callback` without any arguments.

The default `_del()` invokes `callback` on a next tick. It must be overridden.

### `db._batch(operations, options, callback)`

Perform multiple _put_ and/or _del_ operations in bulk. The `operations` argument is always an `Array` containing a list of operations to be executed sequentially, although as a whole they should be performed as an atomic operation. Each operation is guaranteed to have at least `type`, `key` and `keyEncoding` properties. If the type is `put`, the operation will also have `value` and `valueEncoding` properties. There are no default options but `options` will always be an object. If the batch failed, call the `callback` function with an `Error`. Otherwise call `callback` without any arguments.

The default `_batch()` invokes `callback` on a next tick. It must be overridden.

### `db._chainedBatch()`

The default `_chainedBatch()` returns a functional `AbstractChainedBatch` instance that uses `db._batch(array, options, callback)` under the hood. The prototype is available on the main exports for you to extend. If you want to implement chainable batch operations in a different manner then you should extend `AbstractChainedBatch` and return an instance of this prototype in the `_chainedBatch()` method:

```js
const { AbstractChainedBatch } = require('abstract-leveldown')

function ChainedBatch (db) {
  AbstractChainedBatch.call(this, db)
}

Object.setPrototypeOf(ChainedBatch.prototype, AbstractChainedBatch.prototype)

FakeLevelDOWN.prototype._chainedBatch = function () {
  return new ChainedBatch(this)
}
```

### `db._iterator(options)`

The default `_iterator()` returns a noop `AbstractIterator` instance. It must be overridden, by extending `AbstractIterator` (available on the main module exports) and returning an instance of this prototype in the `_iterator(options)` method.

The `options` object will always have the following properties: `reverse`, `keys`, `values`, `limit`, `keyEncoding` and `valueEncoding`.

### `db._clear(options, callback)`

Delete all entries or a range. Does not have to be atomic. It is recommended (and possibly mandatory in the future) to operate on a snapshot so that writes scheduled after a call to `clear()` will not be affected.

Implementations that wrap another `db` can typically forward the `_clear()` call to that `db`, having transformed range options if necessary.

The `options` object will always have the following properties: `reverse`, `limit` and `keyEncoding`. If the user passed range options to `db.clear()`, those will be encoded and set in `options`.

### `iterator = AbstractIterator(db)`

The first argument to this constructor must be an instance of your `AbstractLevelDOWN` implementation. The constructor will set `iterator.db` which is used (among other things) to access encodings and ensures that `db` will not be garbage collected in case there are no other references to it.

#### `iterator._next(callback)`

Advance the iterator and yield the entry at that key. If nexting failed, call the `callback` function with an `Error`. Otherwise, call `callback` with `null`, a `key` and a `value`.

The default `_next()` invokes `callback` on a next tick. It must be overridden.

#### `iterator._seek(target, options)`

Seek the iterator to a given key or the closest key. This method is optional. The `options` object will always have the following properties: `keyEncoding`.

#### `iterator._close(callback)`

Free up underlying resources. This method is guaranteed to only be called once. Once closing is done, call `callback` without any arguments. It is not allowed to yield an error.

The default `_close()` invokes `callback` on a next tick. Overriding is optional.

### `chainedBatch = AbstractChainedBatch(db)`

The first argument to this constructor must be an instance of your `AbstractLevelDOWN` implementation. The constructor will set `chainedBatch.db` which is used to access (among other things) encodings and ensures that `db` will not be garbage collected in case there are no other references to it.

#### `chainedBatch._put(key, value, options)`

Queue a `put` operation on this batch. The `options` object will always have the following properties: `keyEncoding` and `valueEncoding`.

#### `chainedBatch._del(key, options)`

Queue a `del` operation on this batch. The `options` object will always have the following properties: `keyEncoding`.

#### `chainedBatch._clear()`

Clear all queued operations on this batch.

#### `chainedBatch._write(options, callback)`

The default `_write` method uses `db._batch`. If the `_write` method is overridden it must atomically commit the queued operations. There are no default options but `options` will always be an object. If committing fails, call the `callback` function with an `Error`. Otherwise call `callback` without any arguments.

## Test Suite

To prove that your implementation is `abstract-leveldown` compliant, include the abstract test suite in your `test.js` (or similar):

```js
const test = require('tape')
const suite = require('abstract-leveldown/test')
const YourDOWN = require('.')

suite({
  test,
  factory () {
    return new YourDOWN()
  }
})
```

The `test` option _must_ be a function that is API-compatible with `tape`. The `factory` option _must_ be a function that returns a unique and isolated instance of your implementation. The factory will be called many times by the test suite.

If your implementation is disk-based we recommend using [`tempy`](https://github.com/sindresorhus/tempy) (or similar) to create unique temporary directories. Your setup could look something like:

```js
const test = require('tape')
const tempy = require('tempy')
const suite = require('abstract-leveldown/test')
const YourDOWN = require('.')

suite({
  test,
  factory () {
    return new YourDOWN(tempy.directory())
  }
})
```

### Excluding tests

As not every implementation can be fully compliant due to limitations of its underlying storage, some tests may be skipped. This must be done via `db.supports` which is set via the constructor. For example, to skip snapshot tests:

```js
const { AbstractLevelDOWN } = require('abstract-leveldown')

class MyLevelDOWN extends AbstractLevelDOWN {
  constructor (location, options, callback) {
    super({ snapshots: false }, options, callback)
  }
}
```

This also serves as a signal to users of your implementation.

### Reusing `testCommon`

The input to the test suite is a `testCommon` object. Should you need to reuse `testCommon` for your own (additional) tests, use the included utility to create a `testCommon` with defaults:

```js
const test = require('tape')
const suite = require('abstract-leveldown/test')
const YourDOWN = require('.')

const testCommon = suite.common({
  test,
  factory () {
    return new YourDOWN()
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
npm install abstract-leveldown
```

## Contributing

[`Level/abstract-leveldown`](https://github.com/Level/abstract-leveldown) is an **OPEN Open Source Project**. This means that:

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

[leveldown]: https://github.com/Level/leveldown
