# abstract-level

**Abstract class for a lexicographically sorted key-value database.** Provides encodings, sublevels, events and hooks. If you are upgrading, please see [`UPGRADING.md`](UPGRADING.md).

> :pushpin: Wondering what happened to `levelup`? Visit [Frequently Asked Questions](https://github.com/Level/community#faq).

[![level badge][level-badge]](https://github.com/Level/awesome)
[![npm](https://img.shields.io/npm/v/abstract-level.svg)](https://www.npmjs.com/package/abstract-level)
[![Node version](https://img.shields.io/node/v/abstract-level.svg)](https://www.npmjs.com/package/abstract-level)
[![Test](https://img.shields.io/github/actions/workflow/status/Level/abstract-level/test.yml?branch=main\&label=test)](https://github.com/Level/abstract-level/actions/workflows/test.yml)
[![Coverage](https://img.shields.io/codecov/c/github/Level/abstract-level?label=\&logo=codecov\&logoColor=fff)](https://codecov.io/gh/Level/abstract-level)
[![Standard](https://img.shields.io/badge/standard-informational?logo=javascript\&logoColor=fff)](https://standardjs.com)
[![Common Changelog](https://common-changelog.org/badge.svg)](https://common-changelog.org)
[![Donate](https://img.shields.io/badge/donate-orange?logo=open-collective\&logoColor=fff)](https://opencollective.com/level)

## Usage

This module exports an abstract class. End users should instead use modules like [`level`](https://github.com/Level/level) that export a concrete implementation. The purpose of the abstract class is to provide a common interface that looks like this:

```js
// Create a database
const db = new Level('./db', { valueEncoding: 'json' })

// Add an entry with key 'a' and value 1
await db.put('a', 1)

// Add multiple entries
await db.batch([{ type: 'put', key: 'b', value: 2 }])

// Get value of key 'a': 1
const value = await db.get('a')

// Iterate entries with keys that are greater than 'a'
for await (const [key, value] of db.iterator({ gt: 'a' })) {
  console.log(value) // 2
}
```

Usage from TypeScript requires generic type parameters.

<details><summary>TypeScript example</summary>

```ts
// Specify types of keys and values (any, in the case of json).
// The generic type parameters default to Level<string, string>.
const db = new Level<string, any>('./db', { valueEncoding: 'json' })

// All relevant methods then use those types
await db.put('a', { x: 123 })

// Specify different types when overriding encoding per operation
await db.get<string, string>('a', { valueEncoding: 'utf8' })

// Though in some cases TypeScript can infer them
await db.get('a', { valueEncoding: db.valueEncoding('utf8') })

// It works the same for sublevels
const abc = db.sublevel('abc')
const xyz = db.sublevel<string, any>('xyz', { valueEncoding: 'json' })
```

</details>

TypeScript users can benefit from the `using` keyword because `abstract-level` implements [`Symbol.asyncDispose`](https://github.com/tc39/proposal-explicit-resource-management) on its resources. For example:

<details><summary>Using example</summary>

```ts
await db.put('example', 'before')
await using snapshot = db.snapshot()
await db.put('example', 'after')
await db.get('example', { snapshot })) // Returns 'before'
```

The equivalent in JavaScript would be:

```js
await db.put('example', 'before')
const snapshot = db.snapshot()

try {
  await db.put('example', 'after')
  await db.get('example', { snapshot })) // Returns 'before'
} finally {
  await snapshot.close()
}
```

</details>

## Install

With [npm](https://npmjs.org) do:

```shell
npm install abstract-level
```

## Supported Platforms

We aim to support Active LTS and Current Node.js releases, as well as evergreen browsers that are based on Chromium, Firefox or Webkit. Features that the runtime must support include [`queueMicrotask`](https://developer.mozilla.org/en-US/docs/Web/API/queueMicrotask#browser_compatibility), [`Promise.allSettled()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/allSettled#browser_compatibility), [`globalThis`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/globalThis#browser_compatibility) and [async generators](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/async_function*#browser_compatibility). Supported runtimes may differ per implementation.

## Public API For Consumers

This module has a public API for consumers of a database and a [private API](#private-api-for-implementors) for concrete implementations. The public API, as documented in this section, offers a simple yet rich interface that is common between all implementations. Implementations may have additional options or methods. TypeScript [type declarations](https://www.typescriptlang.org/docs/handbook/2/type-declarations.html) are [included](./index.d.ts) (and exported for reuse) only for the public API.

An `abstract-level` database is at its core a [key-value database](https://en.wikipedia.org/wiki/Key%E2%80%93value_database). A key-value pair is referred to as an _entry_ here and typically returned as an array, comparable to [`Object.entries()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/entries).

### `db = new Level(...[, options])`

Creating a database is done by calling a class constructor. Implementations export a class that extends the [`AbstractLevel`](./abstract-level.js) class and has its own constructor with an implementation-specific signature. All constructors should have an `options` argument as the last. Typically, constructors take a `location` as their first argument, pointing to where the data will be stored. That may be a file path, URL, something else or none at all, since not all implementations are disk-based or persistent. Others take another database rather than a location as their first argument.

The optional `options` object may contain:

- `keyEncoding` (string or object, default `'utf8'`): encoding to use for keys
- `valueEncoding` (string or object, default `'utf8'`): encoding to use for values.

See [Encodings](#encodings) for a full description of these options. Other `options` (except `passive`) are forwarded to `db.open()` which is automatically called in a next tick after the constructor returns. Any read & write operations are queued internally until the database has finished opening. If opening fails, those queued operations will yield errors.

### `db.status`

Getter that returns a string reflecting the current state of the database:

- `'opening'` - waiting for the database to be opened
- `'open'` - successfully opened the database
- `'closing'` - waiting for the database to be closed
- `'closed'` - database is closed.

### `db.open([options])`

Open the database. Returns a promise. Options passed to `open()` take precedence over options passed to the database constructor. Not all implementations support the `createIfMissing` and `errorIfExists` options (notably [`memory-level`](https://github.com/Level/memory-level) and [`browser-level`](https://github.com/Level/browser-level)) and will indicate so via `db.supports.createIfMissing` and `db.supports.errorIfExists`.

The optional `options` object may contain:

- `createIfMissing` (boolean, default: `true`): If `true`, create an empty database if one doesn't already exist. If `false` and the database doesn't exist, opening will fail.
- `errorIfExists` (boolean, default: `false`): If `true` and the database already exists, opening will fail.
- `passive` (boolean, default: `false`): Wait for, but do not initiate, opening of the database.

It's generally not necessary to call `open()` because it's automatically called by the database constructor. It may however be useful to capture an error from failure to open, that would otherwise not surface until another method like `db.get()` is called. It's also possible to reopen the database after it has been closed with [`close()`](#dbclose). Once `open()` has then been called, any read & write operations will again be queued internally until opening has finished.

The `open()` and `close()` methods are idempotent. If the database is already open, the promise returned by `open()` will resolve without delay. If opening is already in progress, the promise will resolve when that has finished. If closing is in progress, the database will be reopened once closing has finished. Likewise, if `close()` is called after `open()`, the database will be closed once opening has finished.

### `db.close()`

Close the database. Returns a promise.

A database may have associated resources like file handles and locks. When the database is no longer needed (for the remainder of a program) it's recommended to call `db.close()` to free up resources.

After `db.close()` has been called, no further read & write operations are allowed unless and until `db.open()` is called again. For example, `db.get(key)` will yield an error with code [`LEVEL_DATABASE_NOT_OPEN`](#errors). Any unclosed iterators, snapshots and chained batches will be closed by `db.close()` and can then no longer be used even when `db.open()` is called again.

### `db.get(key[, options])`

Get a value from the database by `key`. The optional `options` object may contain:

- `keyEncoding`: custom key encoding for this operation, used to encode the `key`.
- `valueEncoding`: custom value encoding for this operation, used to decode the value.
- `snapshot`: explicit [snapshot](#snapshot--dbsnapshotoptions) to read from.

Returns a promise for the value. If the `key` was not found then the value will be `undefined`.

### `db.getSync(key[, options])`

Synchronously get a value from the database by `key`. This blocks the event loop but can be significantly faster than `db.get()`. Options are the same. Returns the value, or `undefined` if not found.

### `db.getMany(keys[, options])`

Get multiple values from the database by an array of `keys`. The optional `options` object may contain:

- `keyEncoding`: custom key encoding for this operation, used to encode the `keys`.
- `valueEncoding`: custom value encoding for this operation, used to decode values.
- `snapshot`: explicit [snapshot](#snapshot--dbsnapshotoptions) to read from.

Returns a promise for an array of values with the same order as `keys`. If a key was not found, the relevant value will be `undefined`.

### `db.has(key[, options])`

Check if the database has an entry with the given `key`. The optional `options` object may contain:

- `keyEncoding`: custom key encoding for this operation, used to encode the `key`.
- `snapshot`: explicit [snapshot](#snapshot--dbsnapshotoptions) to read from.

Returns a promise for a boolean. For example:

```js
if (await db.has('fruit')) {
  console.log('We have fruit')
}
```

If the value of the entry is needed, instead do:

```js
const value = await db.get('fruit')

if (value !== undefined) {
  console.log('We have fruit: %o', value)
}
```

### `db.hasMany(keys[, options])`

Check if the database has entries with the given keys. The `keys` argument must be an array. The optional `options` object may contain:

- `keyEncoding`: custom key encoding for this operation, used to encode the `keys`.
- `snapshot`: explicit [snapshot](#snapshot--dbsnapshotoptions) to read from.

Returns a promise for an array of booleans with the same order as `keys`. For example:

```js
await db.put('a', '123')
await db.hasMany(['a', 'b']) // [true, false]
```

### `db.put(key, value[, options])`

Add a new entry or overwrite an existing entry. The optional `options` object may contain:

- `keyEncoding`: custom key encoding for this operation, used to encode the `key`.
- `valueEncoding`: custom value encoding for this operation, used to encode the `value`.

Returns a promise.

### `db.del(key[, options])`

Delete an entry by `key`. The optional `options` object may contain:

- `keyEncoding`: custom key encoding for this operation, used to encode the `key`.

Returns a promise.

### `db.batch(operations[, options])`

Perform multiple _put_ and/or _del_ operations in bulk. Returns a promise. The `operations` argument must be an array containing a list of operations to be executed sequentially, although as a whole they are performed as an atomic operation.

Each operation must be an object with at least a `type` property set to either `'put'` or `'del'`. If the `type` is `'put'`, the operation must have `key` and `value` properties. It may optionally have `keyEncoding` and / or `valueEncoding` properties to encode keys or values with a custom encoding for just that operation. If the `type` is `'del'`, the operation must have a `key` property and may optionally have a `keyEncoding` property.

An operation of either type may also have a `sublevel` property, to prefix the key of the operation with the prefix of that sublevel. This allows atomically committing data to multiple sublevels. The given `sublevel` must have the same _root_ (i.e. top-most) database as `db`. Keys and values will be encoded by the sublevel, to the same effect as a `sublevel.batch(..)` call. In the following example, the first `value` will be encoded with `'json'` rather than the default encoding of `db`:

```js
const people = db.sublevel('people', { valueEncoding: 'json' })
const nameIndex = db.sublevel('names')

await db.batch([{
  type: 'put',
  sublevel: people,
  key: '123',
  value: {
    name: 'Alice'
  }
}, {
  type: 'put',
  sublevel: nameIndex,
  key: 'Alice',
  value: '123'
}])
```

The optional `options` object may contain:

- `keyEncoding`: custom key encoding for this batch, used to encode keys.
- `valueEncoding`: custom value encoding for this batch, used to encode values.

Encoding properties on individual operations take precedence. In the following example, the first value will be encoded with the `'utf8'` encoding and the second with `'json'`.

```js
await db.batch([
  { type: 'put', key: 'a', value: 'foo' },
  { type: 'put', key: 'b', value: 123, valueEncoding: 'json' }
], { valueEncoding: 'utf8' })
```

### `chainedBatch = db.batch()`

Create a [chained batch](#chainedbatch), when `batch()` is called with zero arguments. A chained batch can be used to build and eventually commit an atomic batch of operations:

```js
const chainedBatch = db.batch()
  .del('bob')
  .put('alice', 361)
  .put('kim', 220)

// Commit
await chainedBatch.write()
```

Depending on how it's used, it is possible to obtain greater overall performance with this form of `batch()`, mainly because its methods like `put()` can immediately copy the data of that singular operation to the underlying storage, rather than having to block the event loop while copying the data of multiple operations. However, on several `abstract-level` implementations, chained batch is just sugar and has no performance benefits.

Due to its synchronous nature, it is not possible to create a chained batch before the database has finished opening. Be sure to call `await db.open()` before `chainedBatch = db.batch()`. This does not apply to other database methods.

### `iterator = db.iterator([options])`

Create an [iterator](#iterator). The optional `options` object may contain the following _range options_ to control the range of entries to be iterated:

- `gt` (greater than) or `gte` (greater than or equal): define the lower bound of the range to be iterated. Only entries where the key is greater than (or equal to) this option will be included in the range. When `reverse` is true the order will be reversed, but the entries iterated will be the same.
- `lt` (less than) or `lte` (less than or equal): define the higher bound of the range to be iterated. Only entries where the key is less than (or equal to) this option will be included in the range. When `reverse` is true the order will be reversed, but the entries iterated will be the same.
- `reverse` (boolean, default: `false`): iterate entries in reverse order. Beware that a reverse seek can be slower than a forward seek.
- `limit` (number, default: `Infinity`): limit the number of entries yielded. This number represents a _maximum_ number of entries and will not be reached if the end of the range is reached first. A value of `Infinity` or `-1` means there is no limit. When `reverse` is true the entries with the highest keys will be returned instead of the lowest keys.

The `gte` and `lte` range options take precedence over `gt` and `lt` respectively. If no range options are provided, the iterator will visit all entries of the database, starting at the lowest key and ending at the highest key (unless `reverse` is true). In addition to range options, the `options` object may contain:

- `keys` (boolean, default: `true`): whether to return the key of each entry. If set to `false`, the iterator will yield keys that are `undefined`. Prefer to use `db.keys()` instead.
- `values` (boolean, default: `true`): whether to return the value of each entry. If set to `false`, the iterator will yield values that are `undefined`. Prefer to use `db.values()` instead.
- `keyEncoding`: custom key encoding for this iterator, used to encode range options, to encode `seek()` targets and to decode keys.
- `valueEncoding`: custom value encoding for this iterator, used to decode values.
- `signal`: an [`AbortSignal`](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal) to [abort read operations on the iterator](#aborting-iterators).
- `snapshot`: explicit [snapshot](#snapshot--dbsnapshotoptions) to read from.

Lastly, an implementation is free to add its own options.

> :pushpin: To instead consume data using streams, see [`level-read-stream`](https://github.com/Level/read-stream) and [`level-web-stream`](https://github.com/Level/web-stream).

### `keyIterator = db.keys([options])`

Create a [key iterator](#keyiterator), having the same interface as `db.iterator()` except that it yields keys instead of entries. If only keys are needed, using `db.keys()` may increase performance because values won't have to fetched, copied or decoded. Options are the same as for `db.iterator()` except that `db.keys()` does not take `keys`, `values` and `valueEncoding` options.

```js
// Iterate lazily
for await (const key of db.keys({ gt: 'a' })) {
  console.log(key)
}

// Get all at once. Setting a limit is recommended.
const keys = await db.keys({ gt: 'a', limit: 10 }).all()
```

### `valueIterator = db.values([options])`

Create a [value iterator](#valueiterator), having the same interface as `db.iterator()` except that it yields values instead of entries. If only values are needed, using `db.values()` may increase performance because keys won't have to fetched, copied or decoded. Options are the same as for `db.iterator()` except that `db.values()` does not take `keys` and `values` options. Note that it _does_ take a `keyEncoding` option, relevant for the encoding of range options.

```js
// Iterate lazily
for await (const value of db.values({ gt: 'a' })) {
  console.log(value)
}

// Get all at once. Setting a limit is recommended.
const values = await db.values({ gt: 'a', limit: 10 }).all()
```

### `db.clear([options])`

Delete all entries or a range. Not guaranteed to be atomic. Returns a promise. Accepts the following options (with the same rules as on iterators):

- `gt` (greater than) or `gte` (greater than or equal): define the lower bound of the range to be deleted. Only entries where the key is greater than (or equal to) this option will be included in the range. When `reverse` is true the order will be reversed, but the entries deleted will be the same.
- `lt` (less than) or `lte` (less than or equal): define the higher bound of the range to be deleted. Only entries where the key is less than (or equal to) this option will be included in the range. When `reverse` is true the order will be reversed, but the entries deleted will be the same.
- `reverse` (boolean, default: `false`): delete entries in reverse order. Only effective in combination with `limit`, to delete the last N entries.
- `limit` (number, default: `Infinity`): limit the number of entries to be deleted. This number represents a _maximum_ number of entries and will not be reached if the end of the range is reached first. A value of `Infinity` or `-1` means there is no limit. When `reverse` is true the entries with the highest keys will be deleted instead of the lowest keys.
- `keyEncoding`: custom key encoding for this operation, used to encode range options.
- `snapshot`: explicit [snapshot](#snapshot--dbsnapshotoptions) to read from, such that entries not present in the snapshot will not be deleted. If no `snapshot` is provided, the database may create its own internal snapshot but (unlike on other methods) this is currently not a hard requirement for implementations.

The `gte` and `lte` range options take precedence over `gt` and `lt` respectively. If no options are provided, all entries will be deleted.

### `sublevel = db.sublevel(name[, options])`

Create a [sublevel](#sublevel) that has the same interface as `db` (except for additional, implementation-specific methods) and prefixes the keys of operations before passing them on to `db`. The `name` argument is required and must be a string, or an array of strings (explained further below).

```js
const example = db.sublevel('example')

await example.put('hello', 'world')
await db.put('a', '1')

// Prints ['hello', 'world']
for await (const [key, value] of example.iterator()) {
  console.log([key, value])
}
```

Sublevels effectively separate a database into sections. Think SQL tables, but evented, ranged and realtime! Each sublevel is an `AbstractLevel` instance with its own keyspace, [encodings](https://github.com/Level/abstract-level#encodings), [hooks](https://github.com/Level/abstract-level#hooks) and [events](https://github.com/Level/abstract-level#events). For example, it's possible to have one sublevel with `'buffer'` keys and another with `'utf8'` keys. The same goes for values. Like so:

```js
db.sublevel('one', { valueEncoding: 'json' })
db.sublevel('two', { keyEncoding: 'buffer' })
```

An own keyspace means that `sublevel.iterator()` only includes entries of that sublevel, `sublevel.clear()` will only delete entries of that sublevel, and so forth. Range options get prefixed too.

Fully qualified keys (as seen from the parent database) take the form of `prefix + key` where `prefix` is `separator + name + separator`. If `name` is empty, the effective prefix is two separators. Sublevels can be nested: if `db` is itself a sublevel then the effective prefix is a combined prefix, e.g. `'!one!!two!'`. Note that a parent database will see its own keys as well as keys of any nested sublevels:

```js
// Prints ['!example!hello', 'world'] and ['a', '1']
for await (const [key, value] of db.iterator()) {
  console.log([key, value])
}
```

> :pushpin: The key structure is equal to that of [`subleveldown`](https://github.com/Level/subleveldown) which offered sublevels before they were built-in to `abstract-level`. This means that an `abstract-level` sublevel can read sublevels previously created with (and populated by) `subleveldown`.

Internally, sublevels operate on keys that are either a string, Buffer or Uint8Array, depending on parent database and choice of encoding. Which is to say: binary keys are fully supported. The `name` must however always be a string and can only contain ASCII characters.

The optional `options` object may contain:

- `separator` (string, default: `'!'`): Character for separating sublevel names from user keys and each other. Must sort before characters used in `name`. An error will be thrown if that's not the case.
- `keyEncoding` (string or object, default `'utf8'`): encoding to use for keys
- `valueEncoding` (string or object, default `'utf8'`): encoding to use for values.

The `keyEncoding` and `valueEncoding` options are forwarded to the `AbstractLevel` constructor and work the same, as if a new, separate database was created. They default to `'utf8'` regardless of the encodings configured on `db`. Other options are forwarded too but `abstract-level` has no relevant options at the time of writing. For example, setting the `createIfMissing` option will have no effect. Why is that?

Like regular databases, sublevels open themselves, but they do not affect the state of the parent database. This means a sublevel can be individually closed and (re)opened. If the sublevel is created while the parent database is opening, it will wait for that to finish. Closing the parent database will automatically close the sublevel, along with other resources like iterators.

Lastly, the `name` argument can be an array as a shortcut to create nested sublevels. Those are normally created like so:

```js
const indexes = db.sublevel('idx')
const colorIndex = indexes.sublevel('colors')
```

Here, the parent database of `colorIndex` is `indexes`. Operations made on `colorIndex` are thus forwarded from that sublevel to `indexes` and from there to `db`. At each step, hooks and events are available to transform and react to data from a different perspective. Which comes at a (typically small) performance cost that increases with further nested sublevels. If the `indexes` sublevel is only used to organize keys and not directly interfaced with, operations on `colorIndex` can be made faster by skipping `indexes`:

```js
const colorIndex = db.sublevel(['idx', 'colors'])
```

In this case, the parent database of `colorIndex` is `db`. Note that it's still possible to separately create the `indexes` sublevel, but it will be disconnected from `colorIndex`, meaning that `indexes` will not see (live) operations made on `colorIndex`.

### `encoding = db.keyEncoding([encoding])`

Returns the given `encoding` argument as a normalized encoding object that follows the [`level-transcoder`](https://github.com/Level/transcoder) encoding interface. See [Encodings](#encodings) for an introduction. The `encoding` argument may be:

- A string to select a known encoding by its name
- An object that follows one of the following interfaces: [`level-transcoder`](https://github.com/Level/transcoder#encoding-interface), [`level-codec`](https://github.com/Level/codec#encoding-format), [`abstract-encoding`](https://github.com/mafintosh/abstract-encoding), [`multiformats`](https://github.com/multiformats/js-multiformats/blob/master/src/codecs/interface.ts)
- A previously normalized encoding, such that `keyEncoding(x)` equals `keyEncoding(keyEncoding(x))`
- Omitted, `null` or `undefined`, in which case the default `keyEncoding` of the database is returned.

Other methods that take `keyEncoding` or `valueEncoding` options, accept the same as above. Results are cached. If the `encoding` argument is an object and it has a name then subsequent calls can refer to that encoding by name.

Depending on the encodings supported by a database, this method may return a _transcoder encoding_ that translates the desired encoding from / to an encoding supported by the database. Its `encode()` and `decode()` methods will have respectively the same input and output types as a non-transcoded encoding, but its `name` property will differ.

Assume that e.g. `db.keyEncoding().encode(key)` is safe to call at any time including if the database isn't open, because encodings must be stateless. If the given encoding is not found or supported, a [`LEVEL_ENCODING_NOT_FOUND` or `LEVEL_ENCODING_NOT_SUPPORTED` error](#errors) is thrown.

### `encoding = db.valueEncoding([encoding])`

Same as `db.keyEncoding([encoding])` except that it returns the default `valueEncoding` of the database (if the `encoding` argument is omitted, `null` or `undefined`).

### `key = db.prefixKey(key, keyFormat[, local])`

Add sublevel prefix to the given `key`, which must be already-encoded. If this database is not a sublevel, the given `key` is returned as-is. The `keyFormat` must be one of `'utf8'`, `'buffer'`, `'view'`. If `'utf8'` then `key` must be a string and the return value will be a string. If `'buffer'` then Buffer, if `'view'` then Uint8Array.

```js
const sublevel = db.sublevel('example')

console.log(db.prefixKey('a', 'utf8')) // 'a'
console.log(sublevel.prefixKey('a', 'utf8')) // '!example!a'
```

By default, the given `key` will be prefixed to form a fully-qualified key in the context of the _root_ (i.e. top-most) database, as the following example will demonstrate. If `local` is true, the given `key` will instead be prefixed to form a fully-qualified key in the context of the _parent_ database.

```js
const sublevel = db.sublevel('example')
const nested = sublevel.sublevel('nested')

console.log(nested.prefixKey('a', 'utf8')) // '!example!!nested!a'
console.log(nested.prefixKey('a', 'utf8', true)) // '!nested!a'
```

### `snapshot = db.snapshot(options)`

Create an explicit [snapshot](#snapshot). Throws a [`LEVEL_NOT_SUPPORTED`](#level_not_supported) error if `db.supports.explicitSnapshots` is false ([Level/community#118](https://github.com/Level/community/issues/118)). For details, see [Reading From Snapshots](#reading-from-snapshots).

There are currently no options but specific implementations may add their own.

### `db.supports`

A [manifest](https://github.com/Level/supports) describing the features supported by this database. Might be used like so:

```js
if (!db.supports.permanence) {
  throw new Error('Persistent storage is required')
}
```

### `db.defer(fn[, options])`

Call the function `fn` at a later time when [`db.status`](#dbstatus) changes to `'open'` or `'closed'`. Known as a _deferred operation_. Used by `abstract-level` itself to implement "deferred open" which is a feature that makes it possible to call methods like `db.put()` before the database has finished opening. The `defer()` method is exposed for implementations and plugins to achieve the same on their custom methods:

```js
db.foo = function (key) {
  if (this.status === 'opening') {
    this.defer(() => this.foo(key))
  } else {
    // ..
  }
}
```

The optional `options` object may contain:

- `signal`: an [`AbortSignal`](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal) to abort the deferred operation. When aborted (now or later) the `fn` function will not be called.

When deferring a custom operation, do it early: after normalizing optional arguments but before encoding (to avoid double encoding and to emit original input if the operation has events) and before any _fast paths_ (to avoid calling back before the database has finished opening). For example, `db.batch([])` has an internal fast path where it skips work if the array of operations is empty. Resources that can be closed on their own (like iterators) should however first check such state before deferring, in order to reject operations after close (including when the database was reopened).

### `db.deferAsync(fn[, options])`

Similar to `db.defer(fn)` but for asynchronous work. Returns a promise, which waits for [`db.status`](#dbstatus) to change to `'open'` or `'closed'` and then calls `fn` which itself must return a promise. This allows for recursion:

```js
db.foo = async function (key) {
  if (this.status === 'opening') {
    return this.deferAsync(() => this.foo(key))
  } else {
    // ..
  }
}
```

The optional `options` object may contain:

- `signal`: an [`AbortSignal`](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal) to abort the deferred operation. When aborted (now or later) the `fn` function will not be called, and the promise returned by `deferAsync()` will be rejected with a [`LEVEL_ABORTED`](#level_aborted) error.

### `db.attachResource(resource)`

Keep track of the given `resource` in order to call its `close()` method when the database is closed. Once successfully closed, the resource will no longer be tracked, to the same effect as manually calling [`db.detachResource()`](#dbdetachresourceresource). When given multiple resources, the database will close them in parallel. Resources are kept in a [set](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Set) so that the same object will not be attached (and closed) twice.

Intended for objects that rely on an open database. Used internally for built-in resources like iterators and sublevels, and is publicly exposed for custom resources.

### `db.detachResource(resource)`

Stop tracking the given `resource`.

### `iterator`

An iterator allows one to lazily read a range of entries stored in the database. The entries will be sorted by keys in [lexicographic order](https://en.wikipedia.org/wiki/Lexicographic_order) (in other words: byte order) which in short means key `'a'` comes before `'b'` and key `'10'` comes before `'2'`.

Iterators can be consumed with [`for await...of`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/for-await...of) and `iterator.all()`, or by manually calling `iterator.next()` or `nextv()` in succession. In the latter case, `iterator.close()` must always be called. In contrast, finishing, throwing, breaking or returning from a `for await...of` loop automatically calls `iterator.close()`, as does `iterator.all()`.

An iterator reaches its natural end in the following situations:

- The end of the database has been reached
- The end of the range has been reached
- The last `iterator.seek()` was out of range.

An iterator keeps track of calls that are in progress. It doesn't allow concurrent `next()`, `nextv()` or `all()` calls (including a combination thereof) and will throw an error with code [`LEVEL_ITERATOR_BUSY`](#level_iterator_busy) if that happens:

```js
// Not awaited
iterator.next()

try {
  // Which means next() is still in progress here
  iterator.all()
} catch (err) {
  console.log(err.code) // 'LEVEL_ITERATOR_BUSY'
}
```

#### `for await...of iterator`

Yields entries, which are arrays containing a `key` and `value`. The type of `key` and `value` depends on the options passed to `db.iterator()`.

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

#### `iterator.next()`

Advance to the next entry and yield that entry. Returns a promise for either an entry array (containing a `key` and `value`) or for `undefined` if the iterator reached its natural end. The type of `key` and `value` depends on the options passed to `db.iterator()`.

**Note:** `iterator.close()` must always be called once there's no intention to call `next()` or `nextv()` again. Even if such calls yielded an error and even if the iterator reached its natural end. Not closing the iterator will result in memory leaks and may also affect performance of other operations if many iterators are unclosed and each is holding a snapshot of the database.

#### `iterator.nextv(size[, options])`

Advance repeatedly and get at most `size` amount of entries in a single call. Can be faster than repeated `next()` calls. The `size` argument must be an integer and has a soft minimum of 1. There are no `options` by default but implementations may add theirs.

Returns a promise for an array of entries, where each entry is an array containing a key and value. The natural end of the iterator will be signaled by yielding an empty array.

```js
const iterator = db.iterator()

while (true) {
  const entries = await iterator.nextv(100)

  if (entries.length === 0) {
    break
  }

  for (const [key, value] of entries) {
    // ..
  }
}

await iterator.close()
```

#### `iterator.all([options])`

Advance repeatedly and get all (remaining) entries as an array, automatically closing the iterator. Assumes that those entries fit in memory. If that's not the case, instead use `next()`, `nextv()` or `for await...of`. There are no `options` by default but implementations may add theirs. Returns a promise for an array of entries, where each entry is an array containing a key and value.

```js
const entries = await db.iterator({ limit: 100 }).all()

for (const [key, value] of entries) {
  // ..
}
```

#### `iterator.seek(target[, options])`

Seek to the key closest to `target`. This method is synchronous, but the actual work may happen lazily. Subsequent calls to `iterator.next()`, `nextv()` or `all()` (including implicit calls in a `for await...of` loop) will yield entries with keys equal to or larger than `target`, or equal to or smaller than `target` if the `reverse` option passed to `db.iterator()` was true.

The optional `options` object may contain:

- `keyEncoding`: custom key encoding, used to encode the `target`. By default the `keyEncoding` option of the iterator is used or (if that wasn't set) the `keyEncoding` of the database.

If range options like `gt` were passed to `db.iterator()` and `target` does not fall within that range, the iterator will reach its natural end.

#### `iterator.close()`

Free up underlying resources. Returns a promise. Closing the iterator is an idempotent operation, such that calling `close()` more than once is allowed and makes no difference.

If a `next()` ,`nextv()` or `all()` call is in progress, closing will wait for that to finish. After `close()` has been called, further calls to `next()` ,`nextv()` or `all()` will yield an error with code [`LEVEL_ITERATOR_NOT_OPEN`](#level_iterator_not_open).

#### `iterator.db`

A reference to the database that created this iterator.

#### `iterator.count`

Read-only getter that indicates how many entries have been yielded so far (by any method) excluding calls that errored or yielded `undefined`.

#### `iterator.limit`

Read-only getter that reflects the `limit` that was set in options. Greater than or equal to zero. Equals `Infinity` if no limit, which allows for easy math:

```js
const hasMore = iterator.count < iterator.limit
const remaining = iterator.limit - iterator.count
```

#### Aborting Iterators

Iterators take an experimental `signal` option that, once signaled, aborts an in-progress read operation (if any) and rejects subsequent reads. The relevant promise will be rejected with a [`LEVEL_ABORTED`](#level_aborted) error. Aborting does not close the iterator, because closing is asynchronous and may result in an error that needs a place to go. This means signals should be used together with a pattern that automatically closes the iterator:

```js
const abortController = new AbortController()
const signal = abortController.signal

// Will result in 'aborted' log
abortController.abort()

try {
  for await (const entry of db.iterator({ signal })) {
    console.log(entry)
  }
} catch (err) {
  if (err.code === 'LEVEL_ABORTED') {
    console.log('aborted')
  }
}
```

Otherwise, close the iterator explicitly:

```js
const iterator = db.iterator({ signal })

try {
  const entries = await iterator.nextv(10)
} catch (err) {
  if (err.code === 'LEVEL_ABORTED') {
    console.log('aborted')
  }
} finally {
  await iterator.close()
}
```

Support of signals is indicated via [`db.supports.signals.iterators`](https://github.com/Level/supports#signals-object).

### `keyIterator`

A key iterator has the same interface as `iterator` except that its methods yield keys instead of entries. Usage is otherwise the same.

### `valueIterator`

A value iterator has the same interface as `iterator` except that its methods yield values instead of entries. Usage is otherwise the same.

### `chainedBatch`

#### `chainedBatch.put(key, value[, options])`

Add a `put` operation to this chained batch, not committed until `write()` is called. This will throw a [`LEVEL_INVALID_KEY`](#level_invalid_key) or [`LEVEL_INVALID_VALUE`](#level_invalid_value) error if `key` or `value` is invalid. The optional `options` object may contain:

- `keyEncoding`: custom key encoding for this operation, used to encode the `key`.
- `valueEncoding`: custom value encoding for this operation, used to encode the `value`.
- `sublevel` (sublevel instance): act as though the `put` operation is performed on the given sublevel, to similar effect as `sublevel.batch().put(key, value)`. This allows atomically committing data to multiple sublevels. The given `sublevel` must have the same _root_ (i.e. top-most) database as `chainedBatch.db`. The `key` will be prefixed with the prefix of the sublevel, and the `key` and `value` will be encoded by the sublevel (using the default encodings of the sublevel unless `keyEncoding` and / or `valueEncoding` are provided).

#### `chainedBatch.del(key[, options])`

Add a `del` operation to this chained batch, not committed until `write()` is called. This will throw a [`LEVEL_INVALID_KEY`](#level_invalid_key) error if `key` is invalid. The optional `options` object may contain:

- `keyEncoding`: custom key encoding for this operation, used to encode the `key`.
- `sublevel` (sublevel instance): act as though the `del` operation is performed on the given sublevel, to similar effect as `sublevel.batch().del(key)`. This allows atomically committing data to multiple sublevels. The given `sublevel` must have the same _root_ (i.e. top-most) database as `chainedBatch.db`. The `key` will be prefixed with the prefix of the sublevel, and the `key` will be encoded by the sublevel (using the default key encoding of the sublevel unless `keyEncoding` is provided).

#### `chainedBatch.clear()`

Remove all operations from this chained batch, so that they will not be committed.

#### `chainedBatch.write([options])`

Commit the operations. Returns a promise. All operations will be written atomically, that is, they will either all succeed or fail with no partial commits.

There are no `options` by default but implementations may add theirs. Note that `write()` does not take encoding options. Those can only be set on `put()` and `del()` because implementations may synchronously forward such calls to an underlying store and thus need keys and values to be encoded at that point.

After `write()` or `close()` has been called, no further operations are allowed.

#### `chainedBatch.close()`

Free up underlying resources. This should be done even if the chained batch has zero operations. Automatically called by `write()` so normally not necessary to call, unless the intent is to discard a chained batch without committing it. Closing the batch is an idempotent operation, such that calling `close()` more than once is allowed and makes no difference. Returns a promise.

#### `chainedBatch.length`

The number of operations in this chained batch, including operations that were added by [`prewrite`](#hook--dbhooksprewrite) hook functions if any.

#### `chainedBatch.db`

A reference to the database that created this chained batch.

### `sublevel`

A sublevel is an instance of the `AbstractSublevel` class, which extends `AbstractLevel` and thus has the same API. Sublevels have a few additional properties and methods.

#### `sublevel.prefix`

Prefix of the sublevel. A read-only string property.

```js
const example = db.sublevel('example')
const nested = example.sublevel('nested')

console.log(example.prefix) // '!example!'
console.log(nested.prefix) // '!example!!nested!'
```

#### `sublevel.parent`

Parent database. A read-only property.

```js
const example = db.sublevel('example')
const nested = example.sublevel('nested')

console.log(example.parent === db) // true
console.log(nested.parent === example) // true
```

#### `sublevel.db`

Root database. A read-only property.

```js
const example = db.sublevel('example')
const nested = example.sublevel('nested')

console.log(example.db === db) // true
console.log(nested.db === db) // true
```

#### `sublevel.path([local])`

Get the path of this sublevel, which is its prefix without separators. If `local` is true, exclude path of parent database. If false (the default) then recurse to form a fully-qualified path that travels from the root database to this sublevel.

```js
const example = db.sublevel('example')
const nested = example.sublevel('nested')
const foo = db.sublevel(['example', 'nested', 'foo'])

// Get global or local path
console.log(nested.path()) // ['example', 'nested']
console.log(nested.path(true)) // ['nested']

// Has no intermediary sublevels, so the local option has no effect
console.log(foo.path()) // ['example', 'nested', 'foo']
console.log(foo.path(true)) // ['example', 'nested', 'foo']
```

### `snapshot`

#### `snapshot.ref()`

Increment reference count, to register work that should delay closing until `snapshot.unref()` is called an equal amount of times. The promise that will be returned by `snapshot.close()` will not resolve until the reference count returns to 0. This prevents prematurely closing underlying resources while the snapshot is in use.

It is normally not necessary to call `snapshot.ref()` and `snapshot.unref()` because builtin database methods automatically do.

#### `snapshot.unref()`

Decrement reference count, to indicate that the work has finished.

#### `snapshot.close()`

Free up underlying resources. Be sure to call this when the snapshot is no longer needed, because snapshots may cause the database to temporarily pause internal storage optimizations. Returns a promise. Closing the snapshot is an idempotent operation, such that calling `snapshot.close()` more than once is allowed and makes no difference.

After `snapshot.close()` has been called, no further operations are allowed. For example, `db.get(key, { snapshot })` will throw an error with code [`LEVEL_SNAPSHOT_NOT_OPEN`](#level_snapshot_not_open).

### Encodings

Any database method that takes a `key` argument, `value` argument or range options like `gte`, hereby jointly referred to as `data`, runs that `data` through an _encoding_. This means to encode input `data` and decode output `data`.

[Several encodings](https://github.com/Level/transcoder#built-in-encodings) are builtin courtesy of [`level-transcoder`](https://github.com/Level/transcoder) and can be selected by a short name like `'utf8'` or `'json'`. The default encoding is `'utf8'` which ensures you'll always get back a string. Encodings can be specified for keys and values independently with `keyEncoding` and `valueEncoding` options, either in the database constructor or per method to apply an encoding selectively. For example:

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

An encoding can both widen and limit the range of `data` types. The default `'utf8'` encoding can only store strings. Other types, though accepted, are irreversibly stringified before storage. That includes JavaScript primitives which are converted with [`String(x)`](https://tc39.es/ecma262/multipage/text-processing.html#sec-string-constructor-string-value), Buffer which is converted with [`x.toString('utf8')`](https://nodejs.org/api/buffer.html#buftostringencoding-start-end) and Uint8Array converted with [`TextDecoder#decode(x)`](https://developer.mozilla.org/en-US/docs/Web/API/TextDecoder/decode). Use other encodings for a richer set of `data` types, as well as binary data without a conversion cost - or loss of non-unicode bytes.

For binary data two builtin encodings are available: `'buffer'` and `'view'`. They use a Buffer or Uint8Array respectively. To some extent these encodings are interchangeable, as the `'buffer'` encoding also accepts Uint8Array as input `data` (and will convert that to a Buffer without copying the underlying ArrayBuffer), the `'view'` encoding also accepts Buffer as input `data` and so forth. Output `data` will be either a Buffer or Uint8Array respectively and can also be converted:

```js
const db = level('./db', { valueEncoding: 'view' })
const buffer = await db.get('example', { valueEncoding: 'buffer' })
```

In browser environments it may be preferable to only use `'view'`. When bundling JavaScript with Webpack, Browserify or other, you can choose not to use the `'buffer'` encoding and (through configuration of the bundler) exclude the [`buffer`](https://github.com/feross/buffer) shim in order to reduce bundle size.

Regardless of the choice of encoding, a `key` or `value` may not be `null` or `undefined` due to preexisting significance in iterators and streams. No such restriction exists on range options because `null` and `undefined` are significant types in encodings like [`charwise`](https://github.com/dominictarr/charwise) as well as some underlying stores like IndexedDB. Consumers of an `abstract-level` implementation must assume that range options like `{ gt: undefined }` are _not_ the same as `{}`. The [abstract test suite](#test-suite) does not test these types. Whether they are supported or how they sort may differ per implementation. An implementation can choose to:

- Encode these types to make them meaningful
- Have no defined behavior (moving the concern to a higher level)
- Delegate to an underlying database (moving the concern to a lower level).

Lastly, one way or another, every implementation _must_ support `data` of type String and _should_ support `data` of type Buffer or Uint8Array.

### Events

An `abstract-level` database is an [`EventEmitter`](https://nodejs.org/api/events.html) and emits the events listed below.

#### `opening`

Emitted when database is opening. Receives 0 arguments:

```js
db.once('opening', function () {
  console.log('Opening...')
})
```

#### `open`

Emitted when database has successfully opened. Receives 0 arguments:

```js
db.once('open', function () {
  console.log('Opened!')
})
```

#### `closing`

Emitted when database is closing. Receives 0 arguments.

#### `closed`

Emitted when database has successfully closed. Receives 0 arguments.

#### `write`

Emitted when data was successfully written to the database as the result of `db.batch()`, `db.put()` or `db.del()`. Receives a single `operations` argument, which is an array containing normalized operation objects. The array will contain at least one operation object and reflects modifications made (and operations added) by the [`prewrite`](#hook--dbhooksprewrite) hook. Normalized means that every operation object has `keyEncoding` and (if `type` is `'put'`) `valueEncoding` properties and these are always encoding objects, rather than their string names like `'utf8'` or whatever was given in the input.

Operation objects also include userland options that were provided in the `options` argument of the originating call, for example the `options` in a `db.put(key, value, options)` call:

```js
db.on('write', function (operations) {
  for (const op of operations) {
    if (op.type === 'put') {
      console.log(op.key, op.value, op.foo)
    }
  }
})

// Put with a userland 'foo' option
await db.put('abc', 'xyz', { foo: true })
```

The `key` and `value` of the operation object match the original input, before having encoded it. To provide access to encoded data, the operation object additionally has `encodedKey` and (if `type` is `'put'`) `encodedValue` properties. Event listeners can inspect [`keyEncoding.format`](https://github.com/Level/transcoder#encodingformat) and `valueEncoding.format` to determine the data type of `encodedKey` and `encodedValue`.

As an example, given a sublevel created with `users = db.sublevel('users', { valueEncoding: 'json' })`, a call like `users.put('isa', { score: 10 })` will emit a `write` event from the sublevel with an `operations` argument that looks like the following. Note that specifics (in data types and encodings) may differ per database at it depends on which encodings an implementation supports and uses internally. This example assumes that the database uses `'utf8'`.

```js
[{
  type: 'put',
  key: 'isa',
  value: { score: 10 },
  keyEncoding: users.keyEncoding('utf8'),
  valueEncoding: users.valueEncoding('json'),
  encodedKey: 'isa', // No change (was already utf8)
  encodedValue: '{"score":10}', // JSON-encoded
}]
```

Because sublevels encode and then forward operations to their parent database, a separate `write` event will be emitted from `db` with:

```js
[{
  type: 'put',
  key: '!users!isa', // Prefixed
  value: '{"score":10}', // No change
  keyEncoding: db.keyEncoding('utf8'),
  valueEncoding: db.valueEncoding('utf8'),
  encodedKey: '!users!isa',
  encodedValue: '{"score":10}'
}]
```

Similarly, if a `sublevel` option was provided:

```js
await db.batch()
  .del('isa', { sublevel: users })
  .write()
```

We'll get:

```js
[{
  type: 'del',
  key: '!users!isa', // Prefixed
  keyEncoding: db.keyEncoding('utf8'),
  encodedKey: '!users!isa'
}]
```

Lastly, newly added `write` event listeners are only called for subsequently created batches (including chained batches):

```js
const promise = db.batch([{ type: 'del', key: 'abc' }])
db.on('write', listener) // Too late
await promise
```

For the event listener to be called it must be added earlier:

```js
db.on('write', listener)
await db.batch([{ type: 'del', key: 'abc' }])
```

The same is true for `db.put()` and `db.del()`.

#### `clear`

Emitted when a `db.clear()` call completed and entries were thus successfully deleted from the database. Receives a single `options` argument, which is the verbatim `options` argument that was passed to `db.clear(options)` (or an empty object if none) before having encoded range options.

### Order Of Operations

There is no defined order between parallel write operations. Consider:

```js
await Promise.all([
  db.put('example', 1),
  db.put('example', 2)
])

const result = await db.get('example')
```

The value of `result` could be either `1` or `2`, because the `db.put()` calls are asynchronous and awaited in parallel. Some implementations of `abstract-level` may unintentionally exhibit a "defined" order due to internal details. Implementations are free to change such details at any time, because per the asynchronous `abstract-level` interface that they follow, the order is theoretically random.

Removing this concern (if necessary) must be done on an application-level. For example, the application could have a queue of operations, or per-key locks, or implement transactions on top of snapshots, or a versioning mechanism in its keyspace, or specialized data types like CRDT, or just say that conflicts are acceptable for that particular application, and so forth. The abundance of examples should explain why `abstract-level` itself doesn't enter this opinionated and application-specific problem space. Each solution has tradeoffs and `abstract-level`, being the core of a modular database, cannot decide which tradeoff to make.

### Reading From Snapshots

A snapshot is a lightweight "token" that represents a version of a database at a particular point in time. This allows for reading data without seeing subsequent writes made on the database. It comes in two forms:

1. Implicit snapshots: created internally by the database and not visible to the outside world.
2. Explicit snapshots: created with `snapshot = db.snapshot()`. Because it acts as a token, `snapshot` has no read methods of its own. Instead the snapshot is to be passed to database methods like `db.get()` and `db.iterator()`. This also works on sublevels.

Use explicit snapshots wisely, because their lifetime must be managed manually. Implicit snapshots are typically more convenient and possibly more performant because they can handled natively and have their lifetime limited by the surrounding operation. That said, explicit snapshots can be useful to make multiple read operations that require a shared, consistent view of the data.

Most but not all `abstract-level` implementations support snapshots. They can be divided into three groups.

#### 1. Implementation does not support snapshots

As indicated by `db.supports.implicitSnapshots` and `db.supports.explicitSnapshots` being false. In this case, operations read from the latest version of the database. This most notably affects iterators:

```js
await db.put('example', 'a')
const it = db.iterator()
await db.del('example')
const entries = await it.all() // Likely an empty array
```

The `db.supports.implicitSnapshots` property is aliased as `db.supports.snapshots` for backwards compatibility.

#### 2. Implementation supports implicit snapshots

As indicated by `db.supports.implicitSnapshots` being true. An iterator, upon creation, will synchronously create a snapshot and subsequently read from that snapshot rather than the latest version of the database. There are no actual numerical versions, but let's say there are in order to clarify the behavior:

```js
await db.put('example', 'a')   // Results in v1
const it = db.iterator()       // Creates snapshot of v1
await db.del('example')        // Results in v2
const entries = await it.all() // Reads from snapshot and thus v1
```

The `entries` array thus includes the deleted entry, because the snapshot of the iterator represents the database version from before the entry was deleted.

Other read operations like `db.get()` also use a snapshot. Such calls synchronously create a snapshot and then asynchronously read from it. This means a write operation (to the same key) may not be visible unless awaited:

```js
await db.put('example', 1) // Awaited
db.put('example', 2)       // Not awaited
await db.get('example')    // Yields 1 (typically)
```

In other words, once a write operation has _finished_ (including having communicated that to the main thread of JavaScript, i.e. by resolving the promise in the above example) subsequent reads are guaranteed to include that data. That's because those reads use a snapshot created in the main thread which is aware of the finished write at this point. Before that point, no guarantee can be given.

#### 3. Implementation supports explicit snapshots

As indicated by `db.supports.explicitSnapshots` being true. This is the most precise and flexible way to control the version of the data to read. The previous example can be modified to get a consistent result:

```js
await db.put('example', 1)
const snapshot = db.snapshot()
db.put('example', 2)
await db.get('example', { snapshot })) // Yields 1 (always)
await snapshot.close()
```

The main use case for explicit snapshots is retrieving data from an index.

```js
// We'll use charwise to encode "compound" keys
const charwise = require('charwise-compact')
const players = db.sublevel('players', { valueEncoding: 'json' })
const index = db.sublevel('scores', { keyEncoding: charwise })

// Write sample data (using an atomic batch so that the index remains in-sync)
await db.batch()
  .put('alice', { score: 620 }, { sublevel: players })
  .put([620, 'alice'], '', { sublevel: index })
  .write()

// Iterate players that have a score higher than 100
const snapshot = db.snapshot()
const iterator = index.keys({ gt: [100, charwise.HI], snapshot })

for await (const key of iterator) {
  // Index key is [620, 'alice'] so key[1] gives us 'alice'
  const player = await players.get(key[1], { snapshot })
}

// Don't forget to close (and try/catch/finally)
await snapshot.close()
```

On implementations that support implicit but not explicit snapshots, some of the above can be simulated. In particular, to get multiple entries from a snapshot, one could create an iterator and then repeatedly `seek()` to the desired entries.

### Hooks

**Hooks are experimental and subject to change without notice.**

Hooks allow userland _hook functions_ to customize behavior of the database. Each hook is a different extension point, accessible via `db.hooks`. Some are shared between database methods to encapsulate common behavior. A hook is either synchronous or asynchronous, and functions added to a hook must respect that trait.

#### `hook = db.hooks.prewrite`

A synchronous hook for modifying or adding operations to [`db.batch([])`](#dbbatchoperations-options), [`db.batch().put()`](#chainedbatchputkey-value-options), [`db.batch().del()`](#chainedbatchdelkey-options), [`db.put()`](#dbputkey-value-options) and [`db.del()`](#dbdelkey-options) calls. It does not include [`db.clear()`](#dbclearoptions) because the entries deleted by such a call are not communicated back to `db`.

Functions added to this hook will receive two arguments: `op` and `batch`.

##### Example

```js
const charwise = require('charwise-compact')
const books = db.sublevel('books', { valueEncoding: 'json' })
const index = db.sublevel('authors', { keyEncoding: charwise })

books.hooks.prewrite.add(function (op, batch) {
  if (op.type === 'put') {
    batch.add({
      type: 'put',
      key: [op.value.author, op.key],
      value: '',
      sublevel: index
    })
  }
})

// Will atomically commit it to the author index as well
await books.put('12', { title: 'Siddhartha', author: 'Hesse' })
```

##### Arguments

###### `op` (object)

The `op` argument reflects the input operation and has the following properties: `type`, `key`, `keyEncoding`, an optional `sublevel`, and if `type` is `'put'` then also `value` and `valueEncoding`. It can also include userland options, that were provided either in the input operation object (if it originated from [`db.batch([])`](#db_batchoperations-options)) or in the `options` argument of the originating call, for example the `options` in `db.del(key, options)`.

The `key` and `value` have not yet been encoded at this point. The `keyEncoding` and `valueEncoding` properties are always encoding objects (rather than encoding names like `'json'`) which means hook functions can call (for example) `op.keyEncoding.encode(123)`.

Hook functions can modify the `key`, `value`, `keyEncoding` and `valueEncoding` properties, but not `type` or `sublevel`. If a hook function modifies `keyEncoding` or `valueEncoding` it can use either encoding names or encoding objects, which will subsequently be normalized to encoding objects. Hook functions can also add custom properties to `op` which will be visible to other hook functions, the private API of the database and in the [`write`](#write) event.

###### `batch` (object)

The `batch` argument of the hook function is an interface to add operations, to be committed in the same batch as the input operation(s). This also works if the originating call was a singular operation like `db.put()` because the presence of one or more hook functions will change `db.put()` and `db.del()` to internally use a batch. For originating calls like [`db.batch([])`](#dbbatchoperations-options) that provide multiple input operations, operations will be added after the last input operation, rather than interleaving. The hook function will not be called for operations that were added by either itself or other hook functions.

###### `batch = batch.add(op)`

Add a batch operation, using the same format as the operations that [`db.batch([])`](#dbbatchoperations-options) takes. However, it is assumed that `op` can be freely mutated by `abstract-level`. Unlike input operations it will not be cloned before doing so. The `add` method returns `batch` which allows for chaining, similar to the [chained batch](#chainedbatch) API.

For hook functions to be generic, it is recommended to explicitly define `keyEncoding` and `valueEncoding` properties on `op` (instead of relying on database defaults) or to use an isolated sublevel with known defaults.

#### `hook = db.hooks.postopen`

An asynchronous hook that runs after the database has succesfully opened, but before deferred operations are executed and before events are emitted. It thus allows for additional initialization, including reading and writing data that deferred operations might need. The postopen hook always runs before the prewrite hook.

Functions added to this hook must return a promise and will receive one argument: `options`. If one of the hook functions yields an error then the database will be closed. In the rare event that closing also fails, which means there's no safe state to return to, the database will enter an internal locked state where `db.status` is `'closed'` and subsequent calls to `db.open()` or `db.close()` will be met with a [`LEVEL_STATUS_LOCKED`](#errors) error. This locked state is also used during the postopen hook itself, meaning hook functions are not allowed to call `db.open()` or `db.close()`.

##### Example

```js
db.hooks.postopen.add(async function (options) {
  // Can read and write like usual
  return db.put('example', 123, {
    valueEncoding: 'json'
  })
})
```

##### Arguments

###### `options` (object)

The `options` that were provided in the originating [`db.open(options)`](#dbopenoptions) call, merged with constructor options and defaults. Equivalent to what the private API received in [`db._open(options)`](#db_openoptions).

#### `hook = db.hooks.newsub`

A synchronous hook that runs when a `AbstractSublevel` instance has been created by [`db.sublevel(options)`](#sublevel--dbsublevelname-options). Functions added to this hook will receive two arguments: `sublevel` and `options`.

##### Example

This hook can be useful to hook into a database and any sublevels created on that database. Userland modules that act like plugins might like the following pattern:

```js
module.exports = function logger (db, options) {
  // Recurse so that db.sublevel('foo', opts) will call logger(sublevel, opts)
  db.hooks.newsub.add(logger)

  db.hooks.prewrite.add(function (op, batch) {
    console.log('writing', { db, op })
  })
}
```

##### Arguments

###### `sublevel` (object)

The `AbstractSublevel` instance that was created.

###### `options` (object)

The `options` that were provided in the originating `db.sublevel(options)` call, merged with defaults. Equivalent to what the private API received in [`db._sublevel(options)`](#sublevel--db_sublevelname-options).

#### `hook`

##### `hook.add(fn)`

Add the given `fn` function to this hook, if it wasn't already added.

##### `hook.delete(fn)`

Remove the given `fn` function from this hook.

#### Hook Error Handling

If a hook function throws an error, it will be wrapped in an error with code [`LEVEL_HOOK_ERROR`](#level_hook_error) and abort the originating call:

```js
try {
  await db.put('abc', 123)
} catch (err) {
  if (err.code === 'LEVEL_HOOK_ERROR') {
    console.log(err.cause)
  }
}
```

As a result, other hook functions will not be called.

#### Hooks On Sublevels

On sublevels and their parent database(s), hooks are triggered in bottom-up order. For example, `db.sublevel('a').sublevel('b').batch(..)` will trigger the `prewrite` hook of sublevel `b`, then the `prewrite` hook of sublevel `a` and then of `db`. Only direct operations on a database will trigger hooks, not when a sublevel is provided as an option. This means `db.batch([{ sublevel, ... }])` will trigger the `prewrite` hook of `db` but not of `sublevel`. These behaviors are symmetrical to [events](#events): `db.batch([{ sublevel, ... }])` will only emit a `write` event from `db` while `db.sublevel(..).batch([{ ... }])` will emit a `write` event from the sublevel and then another from `db` (this time with fully-qualified keys).

### Shared Access

Unless documented otherwise, implementations of `abstract-level` do _not_ support accessing a database from multiple processes running in parallel. That includes Node.js clusters and Electron renderer processes.

See [`Level/awesome`](https://github.com/Level/awesome#shared-access) for modules like [`many-level`](https://github.com/Level/many-level) and [`rave-level`](https://github.com/Level/rave-level) that allow a database to be shared across processes and/or machines.

### Errors

Errors thrown by an `abstract-level` database have a `code` property that is an uppercase string. Error codes will not change between major versions, but error messages will. Messages may also differ between implementations; they are free and encouraged to tune messages.

A database may also throw [`TypeError`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/TypeError) errors (or other core error constructors in JavaScript) without a `code` and without any guarantee on the stability of error properties - because these errors indicate invalid arguments and other programming mistakes that should not be catched much less have associated logic.

Error codes will be one of the following.

#### `LEVEL_DATABASE_NOT_OPEN`

When an operation was made on a database while it was closing or closed. The error may have a `cause` property that explains a failure to open:

```js
try {
  await db.open()
} catch (err) {
  console.error(err.code) // 'LEVEL_DATABASE_NOT_OPEN'

  if (err.cause && err.cause.code === 'LEVEL_LOCKED') {
    // Another process or instance has opened the database
  }
}
```

#### `LEVEL_DATABASE_NOT_CLOSED`

When a database failed to `close()`. The error may have a `cause` property that explains a failure to close.

#### `LEVEL_ITERATOR_NOT_OPEN`

When an operation was made on an iterator while it was closing or closed, which may also be the result of the database being closed.

#### `LEVEL_ITERATOR_BUSY`

When `iterator.next()` or `seek()` was called while a previous `next()` call was still in progress.

#### `LEVEL_BATCH_NOT_OPEN`

When an operation was made on a chained batch while it was closing or closed, which may also be the result of the database being closed or that `write()` was called on the chained batch.

#### `LEVEL_SNAPSHOT_NOT_OPEN`

When an operation was made on a snapshot while it was closing or closed, which may also be the result of the database being closed.

#### `LEVEL_ABORTED`

When an operation was aborted by the user. For [web compatibility](https://dom.spec.whatwg.org/#aborting-ongoing-activities) this error can also be identified by its `name` which is `'AbortError'`:

```js
if (err.name === 'AbortError') {
  // Operation was aborted
}
```

#### `LEVEL_ENCODING_NOT_FOUND`

When a `keyEncoding` or `valueEncoding` option specified a named encoding that does not exist.

#### `LEVEL_ENCODING_NOT_SUPPORTED`

When a `keyEncoding` or `valueEncoding` option specified an encoding that isn't supported by the database.

#### `LEVEL_DECODE_ERROR`

When decoding of keys or values failed. The error _may_ have a [`cause`](https://github.com/tc39/proposal-error-cause) property containing an original error. For example, it might be a [`SyntaxError`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SyntaxError) from an internal [`JSON.parse()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/parse) call:

```js
await db.put('key', 'invalid json', { valueEncoding: 'utf8' })

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

#### `LEVEL_IO_ERROR`

Data could not be read (from an underlying store) due to an input/output error, for example from the filesystem.

#### `LEVEL_INVALID_PREFIX`

When a sublevel prefix contains characters outside of the supported byte range.

#### `LEVEL_NOT_SUPPORTED`

When a module needs a certain feature, typically as indicated by `db.supports`, but that feature is not available on a database argument or other. For example, some kind of plugin may depend on snapshots:

```js
const ModuleError = require('module-error')

module.exports = function plugin (db) {
  if (!db.supports.explicitSnapshots) {
    throw new ModuleError('Database must support snapshots', {
      code: 'LEVEL_NOT_SUPPORTED'
    })
  }

  // ..
}
```

#### `LEVEL_LEGACY`

When a method, option or other property was used that has been removed from the API.

#### `LEVEL_LOCKED`

When an attempt was made to open a database that is already open in another process or instance. Used by `classic-level` and other implementations of `abstract-level` that use exclusive locks.

#### `LEVEL_HOOK_ERROR`

An error occurred while running a hook function. The error will have a `cause` property set to the original error thrown from the hook function.

#### `LEVEL_STATUS_LOCKED`

When `db.open()` or `db.close()` was called while database was locked, as described in the [postopen hook](#hook--dbhookspostopen) documentation.

#### `LEVEL_READONLY`

When an attempt was made to write data to a read-only database. Used by `many-level`.

#### `LEVEL_CONNECTION_LOST`

When a database relies on a connection to a remote party and that connection has been lost. Used by `many-level`.

#### `LEVEL_REMOTE_ERROR`

When a remote party encountered an unexpected condition that it can't reflect with a more specific code. Used by `many-level`.

## Private API For Implementors

To implement an `abstract-level` database, extend the [`AbstractLevel`](./abstract-level.js) class and override the private underscored versions of its methods. For example, to implement the public `put()` method, override the private `_put()` method. The same goes for other classes (some of which are optional to override). All classes can be found on the main export of the npm package:

```js
const {
  AbstractLevel,
  AbstractSublevel,
  AbstractIterator,
  AbstractKeyIterator,
  AbstractValueIterator,
  AbstractChainedBatch,
  AbstractSnapshot
} = require('abstract-level')
```

Naming-wise, implementations should use a class name in the form of `*Level` (suffixed, for example `MemoryLevel`) and an npm package name in the form of `*-level` (for example `memory-level`). While utilities and plugins should use a package name in the form of `level-*` (prefixed).

Each of the private methods listed below will receive exactly the number and types of arguments described, regardless of what is passed in through the public API. Public methods provide type checking: if a consumer calls `db.batch(123)` they'll get an error that the first argument must be an array. Optional arguments get sensible defaults: a `db.get(key)` call translates to a `db._get(key, options)` call.

Where possible, the default private methods are sensible noops that do nothing. For example, `db._open()` will simply resolve its promise on a next tick. Other methods have functional defaults. Each method documents whether implementing it is mandatory.

When throwing or yielding an error, prefer using a [known error code](#errors). If new codes are required for your implementation and you wish to use the `LEVEL_` prefix for consistency, feel free to open an issue to discuss. We'll likely want to document those codes here.

### Example

Let's implement a basic in-memory database:

```js
const { AbstractLevel } = require('abstract-level')

class ExampleLevel extends AbstractLevel {
  // This in-memory example doesn't have a location argument
  constructor (options) {
    // Declare supported encodings
    const encodings = { utf8: true }

    // Call AbstractLevel constructor
    super({ encodings }, options)

    // Create a map to store entries
    this._entries = new Map()
  }

  async _open (options) {
    // Here you would open any necessary resources.
  }

  async _put (key, value, options) {
    this._entries.set(key, value)
  }

  async _get (key, options) {
    // Is undefined if not found
    return this._entries.get(key)
  }

  async _del (key, options) {
    this._entries.delete(key)
  }
}
```

Now we can use our implementation:

```js
const db = new ExampleLevel()

await db.put('foo', 'bar')
const value = await db.get('foo')

console.log(value) // 'bar'
```

Although our basic implementation only supports `'utf8'` strings internally, we do get to use [encodings](#encodings) that encode _to_ that. For example, the `'json'` encoding which encodes to `'utf8'`:

```js
const db = new ExampleLevel({ valueEncoding: 'json' })
await db.put('foo', { a: 123 })
const value = await db.get('foo')

console.log(value) // { a: 123 }
```

See [`memory-level`](https://github.com/Level/memory-level) if you are looking for a complete in-memory implementation. The example above notably lacks iterator support and would not pass the [abstract test suite](#test-suite).

### `db = new AbstractLevel(manifest[, options])`

The database constructor. Sets the [`status`](#dbstatus) to `'opening'`. Takes a [manifest](https://github.com/Level/supports) object that the constructor will enrich with defaults. At minimum, the manifest must declare which `encodings` are supported in the private API. For example:

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

If the manifest declared support of `'buffer'`, then `keyEncoding` and `valueEncoding` will always be `'buffer'`. If the manifest declared support of `'utf8'` then `keyEncoding` and `valueEncoding` will be `'utf8'`.

For example: a call like `await db.put(key, { x: 2 }, { valueEncoding: 'json' })` will encode the `{ x: 2 }` value and might forward it to the private API as `db._put(key, '{"x":2}', { valueEncoding: 'utf8' })`. Same for the key (omitted for brevity).

The public API will coerce user input as necessary. If the manifest declared support of `'utf8'` then `await db.get(24)` will forward that number key as a string: `db._get('24', { keyEncoding: 'utf8', ... })`. However, this is _not_ true for output: a private API call like `db._get(key, { keyEncoding: 'utf8', valueEncoding: 'utf8' })` _must_ yield a string value.

All private methods below that take a `key` argument, `value` argument or range option, will receive that data in encoded form. That includes `iterator._seek()` with its `target` argument. So if the manifest declared support of `'buffer'` then `db.iterator({ gt: 2 })` translates into `db._iterator({ gt: Buffer.from('2'), ...options })` and `iterator.seek(128)` translates into `iterator._seek(Buffer.from('128'), options)`.

The `AbstractLevel` constructor will add other supported encodings to the public manifest. If the private API only supports `'buffer'`, the resulting `db.supports.encodings` will nevertheless be as follows because all other encodings can be transcoded to `'buffer'`:

```js
{ buffer: true, view: true, utf8: true, json: true, ... }
```

Implementations can also declare support of multiple encodings. Keys and values will then be encoded and decoded via the most optimal path. For example, [`classic-level`](https://github.com/Level/classic-level) uses:

```js
super({ encodings: { buffer: true, utf8: true } }, options)
```

This has the benefit that user input needs less conversion steps: if the input is a string then `classic-level` can pass that to its LevelDB binding as-is. Vice versa for output.

### `db._open(options)`

Open the database. The `options` object will always have the following properties: `createIfMissing`, `errorIfExists`. When this is called, `db.status` will be `'opening'`. Must return a promise. If opening failed, reject the promise, which will set `db.status` to `'closed'`. Otherwise resolve the promise, which will set `db.status` to `'open'`. The default `_open()` is an async noop.

### `db._close()`

Close the database. When this is called, `db.status` will be `'closing'`. Must return a promise. If closing failed, reject the promise, which will reset `db.status` to `'open'`. Otherwise resolve the promise, which will set `db.status` to `'closed'`. If the database was never opened or failed to open then `_close()` will not be called.

The default `_close()` is an async noop. In native implementations (native addons written in C++ or other) it's recommended to delay closing if any operations are in flight. See [`classic-level`](https://github.com/Level/classic-level) (previously `leveldown`) for an example of this behavior. The JavaScript side in `abstract-level` will prevent _new_ operations before the database is reopened (as explained in constructor documentation above) while the C++ side should prevent closing the database before _existing_ operations have completed.

### `db._get(key, options)`

Get a value by `key`. The `options` object will always have the following properties: `keyEncoding` and `valueEncoding`. Must return a promise. If an error occurs, reject the promise. Otherwise resolve the promise with the value. If the `key` was not found then use `undefined` as value.

If the database indicates support of snapshots via `db.supports.implicitSnapshots` then `db._get()` must read from a snapshot of the database. That snapshot (or similar mechanism) must be created synchronously when `db._get()` is called, before asynchronously reading the value. This means it should not see the data of write operations that are scheduled immediately after `db._get()`.

The default `_get()` returns a promise for an `undefined` value. It must be overridden.

### `db._getSync(key, options)`

Synchronously get a value by `key`. Receives the same options as `db._get()`. Must return a value, or `undefined` if not found.

The default `_getSync()` throws a [`LEVEL_NOT_SUPPORTED`](#level_not_supported) error. It should be overridden but support of `_getSync()` is currently opt-in. Set `manifest.getSync` to `true` in order to enable tests.

### `db._getMany(keys, options)`

Get multiple values by an array of `keys`. The `options` object will always have the following properties: `keyEncoding` and `valueEncoding`. Must return a promise. If an error occurs, reject the promise. Otherwise resolve the promise with an array of values. If a key does not exist, set the relevant value to `undefined`.

Snapshot behavior of `db._getMany()` must be the same as described for `db._get()` above.

The default `_getMany()` returns a promise for an array of values that is equal in length to `keys` and is filled with `undefined`. It must be overridden.

### `db._has(key, options)`

Check if the database has an entry with the given `key`. The `options` object will always have the following properties: `keyEncoding`. Must return a promise. If an error occurs, reject the promise. Otherwise resolve the promise with a boolean.

The default `_has()` throws a [`LEVEL_NOT_SUPPORTED`](#level_not_supported) error. It is an optional feature at the moment. If implemented then `_hasMany()` must also be implemented. Set `manifest.has` to `true` in order to enable tests:

```js
class ExampleLevel extends AbstractLevel {
  constructor (/* ... */) {
    const manifest = {
      has: true,
      // ...
    }

    super(manifest, options)
  }
}
```

### `db._hasMany(keys, options)`

Check if the database has entries with the given keys. The `keys` argument is guaranteed to be an array. The `options` object will always have the following properties: `keyEncoding`. Must return a promise. If an error occurs, reject the promise. Otherwise resolve the promise with an array of booleans.

### `db._put(key, value, options)`

Add a new entry or overwrite an existing entry. The `options` object will always have the following properties: `keyEncoding` and `valueEncoding`. Must return a promise. If an error occurs, reject the promise. Otherwise resolve the promise, without an argument.

The default `_put()` returns a resolved promise. It must be overridden.

### `db._del(key, options)`

Delete an entry. The `options` object will always have the following properties: `keyEncoding`. Must return a promise. If an error occurs, reject the promise. Otherwise resolve the promise, without an argument.

The default `_del()` returns a resolved promise. It must be overridden.

### `db._batch(operations, options)`

Perform multiple _put_ and/or _del_ operations in bulk. The `operations` argument is always an array containing a list of operations to be executed sequentially, although as a whole they should be performed as an atomic operation. The `_batch()` method will not be called if the `operations` array is empty. Each operation is guaranteed to have at least `type`, `key` and `keyEncoding` properties. If the type is `put`, the operation will also have `value` and `valueEncoding` properties. There are no default options but `options` will always be an object.

Must return a promise. If the batch failed, reject the promise. Otherwise resolve the promise, without an argument.

The public `batch()` method supports encoding options both in the `options` argument and per operation. The private `_batch()` method should only support encoding options per operation, which are guaranteed to be set and to be normalized (the `options` argument in the private API might also contain encoding options but only because it's cheaper to not remove them).

The default `_batch()` returns a resolved promise. It must be overridden.

### `db._chainedBatch()`

The default `_chainedBatch()` returns a functional `AbstractChainedBatch` instance that uses `db._batch(array, options)` under the hood. To implement chained batch in an optimized manner, extend `AbstractChainedBatch` and return an instance of this class in the `_chainedBatch()` method:

```js
const { AbstractChainedBatch } = require('abstract-level')

class ExampleChainedBatch extends AbstractChainedBatch {
  constructor (db) {
    super(db)
  }
}

class ExampleLevel extends AbstractLevel {
  _chainedBatch () {
    return new ExampleChainedBatch(this)
  }
}
```

### `db._iterator(options)`

The default `_iterator()` returns a noop `AbstractIterator` instance. It must be overridden, by extending `AbstractIterator` and returning an instance of this class in the `_iterator(options)` method:

```js
const { AbstractIterator } = require('abstract-level')

class ExampleIterator extends AbstractIterator {
  constructor (db, options) {
    super(db, options)
  }

  // ..
}

class ExampleLevel extends AbstractLevel {
  _iterator (options) {
    return new ExampleIterator(this, options)
  }
}
```

The `options` object will always have the following properties: `reverse`, `keys`, `values`, `limit`, `keyEncoding` and `valueEncoding`. The `limit` will always be an integer, greater than or equal to `-1` and less than `Infinity`. If the user passed range options to `db.iterator()`, those will be encoded and set in `options`.

### `db._keys(options)`

The default `_keys()` returns a functional iterator that wraps `db._iterator()` in order to map entries to keys. For optimal performance it can be overridden by extending `AbstractKeyIterator`:

```js
const { AbstractKeyIterator } = require('abstract-level')

class ExampleKeyIterator extends AbstractKeyIterator {
  constructor (db, options) {
    super(db, options)
  }

  // ..
}

class ExampleLevel extends AbstractLevel {
  _keys (options) {
    return new ExampleKeyIterator(this, options)
  }
}
```

The `options` object will always have the following properties: `reverse`, `limit` and `keyEncoding`. The `limit` will always be an integer, greater than or equal to `-1` and less than `Infinity`. If the user passed range options to `db.keys()`, those will be encoded and set in `options`.

### `db._values(options)`

The default `_values()` returns a functional iterator that wraps `db._iterator()` in order to map entries to values. For optimal performance it can be overridden by extending `AbstractValueIterator`:

```js
const { AbstractValueIterator } = require('abstract-level')

class ExampleValueIterator extends AbstractValueIterator {
  constructor (db, options) {
    super(db, options)
  }

  // ..
}

class ExampleLevel extends AbstractLevel {
  _values (options) {
    return new ExampleValueIterator(this, options)
  }
}
```

The `options` object will always have the following properties: `reverse`, `limit`, `keyEncoding` and `valueEncoding`. The `limit` will always be an integer, greater than or equal to -1 and less than Infinity. If the user passed range options to `db.values()`, those will be encoded and set in `options`.

### `db._clear(options)`

Delete all entries or a range. Does not have to be atomic. Must return a promise. If an error occurs, reject the promise. Otherwise resolve the promise, without an argument. It is recommended (and possibly mandatory in the future) to operate on a snapshot so that writes scheduled after a call to `clear()` will not be affected.

Implementations that wrap another database can typically forward the `_clear()` call to that database, having transformed range options if necessary.

The `options` object will always have the following properties: `reverse`, `limit` and `keyEncoding`. If the user passed range options to `db.clear()`, those will be encoded and set in `options`.

### `sublevel = db._sublevel(name, options)`

Create a [sublevel](#sublevel). The `options` object will always have the following properties: `separator`. The default `_sublevel()` returns a new instance of the [`AbstractSublevel`](./lib/abstract-sublevel.js) class. Overriding is optional. The `AbstractSublevel` can be extended in order to add additional methods to sublevels:

```js
const { AbstractLevel, AbstractSublevel } = require('abstract-level')

class ExampleLevel extends AbstractLevel {
  _sublevel (name, options) {
    return new ExampleSublevel(this, name, options)
  }
}

// For brevity this does not handle deferred open
class ExampleSublevel extends AbstractSublevel {
  example (key, options) {
    // Encode and prefix the key
    const keyEncoding = this.keyEncoding(options.keyEncoding)
    const keyFormat = keyEncoding.format

    key = this.prefixKey(keyEncoding.encode(key), keyFormat, true)

    // The parent database can be accessed like so. Make sure
    // to forward encoding options and use the full key.
    this.parent.del(key, { keyEncoding: keyFormat }, ...)
  }
}
```

### `snapshot = db._snapshot(options)`

Create a snapshot. The `options` argument is guaranteed to be an object. There are currently no options but implementations may add their own.

The default `_snapshot()` throws a [`LEVEL_NOT_SUPPORTED`](#level_not_supported) error. To implement this method, extend `AbstractSnapshot`, return an instance of this class in an overridden `_snapshot()` method and set `manifest.explicitSnapshots` to `true`:

```js
const { AbstractSnapshot } = require('abstract-level')

class ExampleSnapshot extends AbstractSnapshot {
  constructor (options) {
    super(options)
  }
}

class ExampleLevel extends AbstractLevel {
  constructor (/* ..., */ options) {
    const manifest = {
      explicitSnapshots: true,
      // ...
    }

    super(manifest, options)
  }

  _snapshot (options) {
    return new ExampleSnapshot(options)
  }
}
```

The snapshot of the underlying database (or other mechanisms to achieve the same effect) must be created synchronously, such that a call like `db.put()` made immediately after `db._snapshot()` will not affect the snapshot. As for previous write operations that are still in progress at the time that `db._snapshot()` is called: `db._snapshot()` does not have to (and should not) wait for such operations. Solving inconsistencies that may arise from this behavior is an application-level concern. To be clear, if the application awaits the write operations before calling `db.snapshot()` then the snapshot does need to reflect (include) those operations.

### `iterator = new AbstractIterator(db, options)`

The first argument to this constructor must be an instance of the relevant `AbstractLevel` implementation. The constructor will set `iterator.db` which is used (among other things) to access encodings and ensures that `db` will not be garbage collected in case there are no other references to it. The `options` argument must be the original `options` object that was passed to `db._iterator()` and it is therefore not (publicly) possible to create an iterator via constructors alone.

The `signal` option, if any and once signaled, should abort an in-progress `_next()`, `_nextv()` or `_all()` call and reject the promise returned by that call with a [`LEVEL_ABORTED`](#level_aborted) error. Doing so is optional until a future semver-major release. Responsibilities are divided as follows:

1. Before a database has finished opening, `abstract-level` handles the signal
2. While a call is in progress, the implementation handles the signal
3. Once the signal is aborted, `abstract-level` rejects further calls.

A method like `_next()` therefore doesn't have to check the signal _before_ it start its asynchronous work, only _during_ that work. If supported, set `db.supports.signals.iterators` to `true` (via the manifest passed to the database constructor) which also enables relevant tests in the [test suite](#test-suite).

#### `iterator._next()`

Advance to the next entry and yield that entry. Must return a promise. If an error occurs, reject the promise. If the natural end of the iterator has been reached, resolve the promise with `undefined`. Otherwise resolve the promise with an array containing a `key` and `value`. If a `limit` was set and the iterator already yielded that many entries (via any of the methods) then `_next()` will not be called.

The default `_next()` returns a promise for `undefined`. It must be overridden.

#### `iterator._nextv(size, options)`

Advance repeatedly and get at most `size` amount of entries in a single call. The `size` argument will always be an integer greater than 0. If a `limit` was set then `size` will be at most `limit - iterator.count`. If a `limit` was set and the iterator already yielded that many entries (via any of the methods) then `_nextv()` will not be called. There are no default options but `options` will always be an object.

Must return a promise. If an error occurs, reject the promise. Otherwise resolve the promise with an array of entries. An empty array signifies the natural end of the iterator, so yield an array with at least one entry if the end has not been reached yet.

The default `_nextv()` is a functional default that makes repeated calls to `_next()` and should be overridden for better performance.

#### `iterator._all(options)`

Advance repeatedly and get all (remaining) entries as an array. If a `limit` was set and the iterator already yielded that many entries (via any of the methods) then `_all()` will not be called. Do not call `close()` here because `all()` will do so (regardless of any error) and this may become an opt-out behavior in the future. There are no default options but `options` will always be an object.

Must return a promise. If an error occurs, reject the promise. Otherwise resolve the promise with an array of entries.

The default `_all()` is a functional default that makes repeated calls to `_nextv()` and should be overridden for better performance.

#### `iterator._seek(target, options)`

Seek to the key closest to `target`. The `options` object will always have the following properties: `keyEncoding`. The default `_seek()` will throw an error with code [`LEVEL_NOT_SUPPORTED`](#errors) and must be overridden.

#### `iterator._close()`

Free up underlying resources. This method is guaranteed to only be called once. Must return a promise.

The default `_close()` returns a resolved promise. Overriding is optional.

### `keyIterator = AbstractKeyIterator(db, options)`

A key iterator has the same interface and constructor arguments as `AbstractIterator` except that it must yields keys instead of entries. The same goes for value iterators:

```js
class ExampleKeyIterator extends AbstractKeyIterator {
  async _next () {
    return 'example-key'
  }
}

class ExampleValueIterator extends AbstractValueIterator {
  async _next () {
    return 'example-value'
  }
}
```

The `options` argument must be the original `options` object that was passed to `db._keys()` and it is therefore not (publicly) possible to create a key iterator via constructors alone. The same goes for value iterators via `db._values()`.

**Note:** the `AbstractKeyIterator` and `AbstractValueIterator` classes do _not_ extend the `AbstractIterator` class. Similarly, if your implementation overrides `db._keys()` returning a custom subclass of `AbstractKeyIterator`, then that subclass must implement methods like `_next()` separately from your subclass of `AbstractIterator`.

### `valueIterator = AbstractValueIterator(db, options)`

A value iterator has the same interface and constructor arguments as `AbstractIterator` except that it must yields values instead of entries. For further details, see `keyIterator` above.

### `chainedBatch = new AbstractChainedBatch(db, options)`

The first argument to this constructor must be an instance of the relevant `AbstractLevel` implementation. The constructor will set `chainedBatch.db` which is used (among other things) to access encodings and ensures that `db` will not be garbage collected in case there are no other references to it.

There are two ways to implement a chained batch. If `options.add` is true, only `_add()` will be called. If `options.add` is false or not provided, only `_put()` and `_del()` will be called.

#### `chainedBatch._add(op)`

Add a `put` or `del` operation. The `op` object will always have the following properties: `type`, `key`, `keyEncoding` and (if `type` is `'put'`) `value` and `valueEncoding`.

#### `chainedBatch._put(key, value, options)`

Add a `put` operation. The `options` object will always have the following properties: `keyEncoding` and `valueEncoding`.

#### `chainedBatch._del(key, options)`

Add a `del` operation. The `options` object will always have the following properties: `keyEncoding`.

#### `chainedBatch._clear()`

Remove all operations from this batch.

#### `chainedBatch._write(options)`

The default `_write()` method uses `db._batch()`. If `_write()` is overridden it must atomically commit the operations. There are no default options but `options` will always be an object. Must return a promise. If an error occurs, reject the promise. Otherwise resolve the promise, without an argument. The `_write()` method will not be called if the chained batch contains zero operations.

#### `chainedBatch._close()`

Free up underlying resources. This method is guaranteed to only be called once. Must return a promise.

The default `_close()` returns a resolved promise. Overriding is optional.

### `snapshot = new AbstractSnapshot(db)`

The first argument to this constructor must be an instance of the relevant `AbstractLevel` implementation.

#### `snapshot._close()`

Free up underlying resources. This method is guaranteed to only be called once and will not be called while read operations like `db._get()` are inflight. Must return a promise.

The default `_close()` returns a resolved promise. Overriding is optional.

## Test Suite

To prove that your implementation is `abstract-level` compliant, include the abstract test suite in your `test.js` (or similar):

```js
const test = require('tape')
const suite = require('abstract-level/test')
const ExampleLevel = require('.')

suite({
  test,
  factory (options) {
    return new ExampleLevel(options)
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
  factory (options) {
    return new ExampleLevel(tempy.directory(), options)
  }
})
```

### Excluding tests

As not every implementation can be fully compliant due to limitations of its underlying storage, some tests may be skipped. This must be done via `db.supports` which is set via the constructor. For example, to skip tests of implicit snapshots:

```js
const { AbstractLevel } = require('abstract-level')

class ExampleLevel extends AbstractLevel {
  constructor (location, options) {
    super({ implicitSnapshots: false }, options)
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
  factory (options) {
    return new ExampleLevel(options)
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

testCommon.supports.explicitSnapshots && test('another test', function (t) {
  const db = testCommon.factory()
  // ..
})
```

## Spread The Word

If you'd like to share your awesome implementation with the world, here's what you might want to do:

- Add an awesome badge to your `README`: `![level badge](https://leveljs.org/img/badge.svg)`
- Publish your awesome module to [npm](https://npmjs.org)
- Send a Pull Request to [Level/awesome](https://github.com/Level/awesome) to advertise your work!

## Contributing

[`Level/abstract-level`](https://github.com/Level/abstract-level) is an **OPEN Open Source Project**. This means that:

> Individuals making significant and valuable contributions are given commit-access to the project to contribute as they see fit. This project is more like an open wiki than a standard guarded open source project.

See the [Contribution Guide](https://github.com/Level/community/blob/master/CONTRIBUTING.md) for more details.

## Donate

Support us with a monthly donation on [Open Collective](https://opencollective.com/level) and help us continue our work.

## License

[MIT](LICENSE)

[level-badge]: https://leveljs.org/img/badge.svg
