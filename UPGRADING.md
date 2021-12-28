# Upgrade Guide

This document describes breaking changes and how to upgrade. For a complete list of changes including minor and patch releases, please refer to the [changelog](CHANGELOG.md).

## Table of Contents

<details><summary>Click to expand</summary>

- [Upcoming](#upcoming)
  - [1. API parity with `levelup`](#1-api-parity-with-levelup)
    - [1.1. New: Promise support](#11-new-promise-support)
    - [1.2. New: events & idempotent open](#12-new-events--idempotent-open)
    - [1.3. New: deferred open](#13-new-deferred-open)
    - [1.4. New: state checks](#14-new-state-checks)
    - [1.5. New: chained batch length](#15-new-chained-batch-length)
  - [2. API parity with `level`](#2-api-parity-with-level)
    - [2.1. New: encodings](#21-new-encodings)
    - [2.2. Other notable changes](#22-other-notable-changes)
  - [3. Streams have moved](#3-streams-have-moved)
  - [4. Resources are auto-closed](#4-resources-are-auto-closed)
    - [4.1. Closing iterators is idempotent](#41-closing-iterators-is-idempotent)
    - [4.2. Chained batch can be closed](#42-chained-batch-can-be-closed)
  - [5. Errors now use codes](#5-errors-now-use-codes)
  - [6. Semi-private properties have been removed](#6-semi-private-properties-have-been-removed)
  - [7. Changes to test suite](#7-changes-to-test-suite)
  - [8. Sublevels are builtin](#8-sublevels-are-builtin)

</details>

## Upcoming

**Introducing `abstract-level`: a fork of `abstract-leveldown` that removes the need for `levelup`, `encoding-down` and `subleveldown`. This means that an `abstract-level` database is a complete solution that doesn't need to be wrapped. It has the same API as `level(up)` including encodings, promises and events. In addition, implementations can now choose to use Uint8Array for keys and values instead of Buffer. Consumers of an implementation can use both. Sublevels are builtin.**

We've put together several upgrade guides for different modules. See the [FAQ](https://github.com/Level/community#faq) to find the best upgrade guide for you. This upgrade guide describes how to replace `abstract-leveldown` with `abstract-level`.

The npm package name is `abstract-level` and the main export (and prototype) is called `AbstractLevel` rather than `AbstractLevelDOWN`. Support of Node.js 10 has been dropped.

For most folks, a database that upgraded from `abstract-leveldown` to `abstract-level` can be a drop-in replacement for a `level(up)` database (with the exception of stream methods). Let's start this guide there: all methods have been enhanced and tuned to reach API parity with `levelup` and `level`.

### 1. API parity with `levelup`

#### 1.1. New: Promise support

All methods that take a callback now also support promises. They return a promise if no callback is provided, the same as `levelup`. Implementations that override public (non-underscored) methods _must_ do the same and any implementation _should_ do the same for additional methods if any.

#### 1.2. New: events & idempotent open

The prototype of `require('abstract-level').AbstractLevel` inherits from `require('events').EventEmitter`. Opening and closing is idempotent and safe, and an instance emits the same events as `levelup` would (with the exception of the `'ready'` alias that `levelup` has for the `'open'` event - `abstract-level` only emits `'open'`).

#### 1.3. New: deferred open

Deferred open is built-in. This means an `abstract-level` database opens itself a tick after its constructor returns (unless `open()` was called in the mean time). Any operations made until opening has completed are queued up in memory. When opening completes the operations are replayed. If opening failed (and this is a new behavior compared to `levelup`) the operations will yield errors. The `abstract-level` prototype has a new `defer()` method for an implementation to defer custom operations.

The initial `status` of an `abstract-level` database is 'opening' rather than 'new', which no longer exists. Wrapping an `abstract-level` database with `levelup` or `deferred-leveldown` is not supported and will exhibit undefined behavior.

Unlike `levelup` an `abstract-level` database is not "patch-safe". If some form of plugin monkey-patches a database like in the following example, it must now also take the responsibility of deferring the operation (as well as handling promises and callbacks) using `db.defer()`. I.e. this example is incomplete:

```js
function plugin (db) {
  const original = db.get
  db.get = function (...args) {
    original.call(this, ...args)
  }
}
```

#### 1.4. New: state checks

On any operation, an `abstract-level` database checks if it's open. If not, it will either throw an error (if the relevant API is synchronous) or asynchronously yield an error. For example:

```js
try {
  db.iterator()
} catch (err) {
  console.log(err.code) // LEVEL_DATABASE_NOT_OPEN
}
```

_Errors now have a `code` property. More on that below\._

This may be a breaking change downstream because it changes error messages for implementations that had their own safety checks (which will now be ineffective because `abstract-level` checks are performed first) or implicitly relied on `levelup` checks. By safety we mean mainly that yielding a JavaScript error is preferred over segmentation faults, though non-native implementations also benefit from detecting incorrect usage.

Implementations that have additional methods should add or align their own safety checks for consistency. Like so:

```js
const ModuleError = require('module-error')

// For brevity this example does not implement promises or encodings
LevelDOWN.prototype.approximateSize = function (start, end, callback) {
  if (this.status === 'opening') {
    this.defer(() => this.approximateSize(start, end, callback))
  } else if (this.status !== 'open') {
    this.nextTick(callback, new ModuleError('Database is not open', {
      code: 'LEVEL_DATABASE_NOT_OPEN'
    }))
  } else {
    // ..
  }
}
```

#### 1.5. New: chained batch length

The `AbstractChainedBatch` prototype has a new `length` property that, like a chained batch in `levelup`, returns the number of queued operations in the batch. Implementations should not have to make changes for this unless they monkey-patched public methods of `AbstractChainedBatch`.

### 2. API parity with `level`

It was previously necessary to use `level` (or similar: `level-mem`, `level-rocksdb` and more) to get the "full experience". These modules combined an `abstract-leveldown` implementation with `encoding-down` and `levelup`. Encodings are now built-in to `abstract-level`, using [`level-transcoder`](https://github.com/Level/transcoder) rather than [`level-codec`](https://github.com/Level/codec).

A future version of `level` will likely simply export `leveldown` in Node.js and `level-js` in browsers.

#### 2.1. New: encodings

All relevant methods including the `AbstractLevel` constructor now accept `keyEncoding` and `valueEncoding` options. Read operations now yield strings rather than buffers by default, to align with `level` and friends.

Both the public and private API of `abstract-level` are encoding-aware. This means that private methods receive `keyEncoding` and `valueEncoding` options too, instead of `keyAsBuffer`, `valueAsBuffer` or `asBuffer`. Implementations don't need to perform encoding or decoding themselves. In fact they can do less: the `_serializeKey()` and `_serializeValue()` methods are also gone and implementations like `memdown` don't have to convert between strings and buffers.

For example: a call like `db.put(key, { x: 2 }, { valueEncoding: 'json' })` will encode the `{ x: 2 }` value and might forward it to the private API as `db._put(key, '{"x":2}', { valueEncoding: 'utf8' }, callback)`. Same for the key (omitted for brevity).

The encoding options and data received by the private API depend on which encodings it supports. It must declare those via the manifest passed to the `AbstractLevel` constructor. See README for details. For example, an implementation might only support storing data as Uint8Arrays, known here as a "view":

```js
AbstractLevel({ encodings: { view: true } })
```

The JSON example above would then result in `db._put(key, value, { valueEncoding: 'view' })` where `value` is a Uint8Array containing JSON. Implementations can also declare support of multiple encodings; keys and values will then be encoded via the most optimal path.

There are a few differences from `level` and `encoding-down`. Some breaking:

- The `'ascii'`, `'ucs2'` and `'utf16le'` encodings are not supported
- The `'id'` encoding (aliased as `'none'`) which wasn't supported by any active `abstract-leveldown` implementation, has been removed
- The undocumented `encoding` option (as an alias for `valueEncoding`) is not supported.

And non-breaking:

- The `'binary'` encoding has been renamed to `'buffer'`, with `'binary'` as an alias
- The `'utf8'` encoding previously did not touch Buffers. Now it will call `buffer.toString('utf8')` for consistency. Consumers can use the `'buffer'` encoding to avoid this conversion.

#### 2.2. Other notable changes

- Zero-length keys and range options are now valid. Historically they weren't supported for causing segmentation faults in `leveldown`. That doesn't apply to today's codebase.
- The `AbstractIterator` constructor now requires an `options` argument
- The `AbstractIterator#_seek()` method got a new `options` argument
- The `db.supports.bufferKeys` property has been removed.

### 3. Streams have moved

Node.js readable streams must now be created with a new standalone module called [`level-read-stream`](https://github.com/Level/read-stream), rather than database methods like `db.createReadStream()`. Please see its [upgrade guide](https://github.com/Level/read-stream/blob/main/UPGRADING.md#100) for details.

### 4. Resources are auto-closed

To further improve safety and consistency, additional changes were made that make an `abstract-level` database safer to use than `abstract-leveldown` wrapped with `levelup`.

#### 4.1. Closing iterators is idempotent

The `iterator.end()` method has been renamed to `iterator.close()`, with `end()` being an alias until a next major version in the future. The term "close" makes it easier to differentiate between the iterator having reached its natural end (data-wise) versus closing it to cleanup resources.

Likewise, `_end()` has been renamed to `_close()` but without an alias. This method is no longer allowed to yield an error.

On `db.close()`, non-closed iterators are now automatically closed. This may be a breaking change but only if an implementation has (at its own risk) overridden the public `end()` method, because `close()` or `end()` is now an idempotent operation rather than yielding an `end() already called on iterator` error. If a `next()` is in progress, closing the iterator (or database) will wait for that.

The error message `cannot call next() after end()` has been replaced with code `LEVEL_ITERATOR_NOT_OPEN`, the error `cannot call seek() after end()` has been removed in favor of a silent return, and `cannot call next() before previous next() has completed` and `cannot call seek() before next() has completed` have been replaced with code `LEVEL_ITERATOR_BUSY`.

The `next()` method no longer returns `this` (when a callback is provided).

#### 4.2. Chained batch can be closed

Chained batch has a new method `close()` which is an idempotent operation and automatically called after `write()` (for backwards compatibility) or on `db.close()`. This to ensure batches can't be used after closing and reopening a db. If a `write()` is in progress, closing will wait for that. If `write()` is never called then `close()` must be.

These changes could be breaking for an implementation that has (at its own risk) overridden the public `write()` method. In addition, the error message `write() already called on this batch` has been replaced with code `LEVEL_BATCH_NOT_OPEN`.

An implementation can optionally override `AbstractChainedBatch#_close()` if it has resources to free (and wishes to free them earlier than GC would).

### 5. Errors now use codes

The [`level-errors`](https://github.com/Level/errors) module as used by `levelup` and friends, is not used or exposed by `abstract-level`. Instead errors thrown or yielded from a database have a `code` property. See the [`README`](./README.md#errors) for details. Going forward, the semver contract will be on `code` and error messages will change without a semver-major bump.

To minimize breakage, the most used error as yielded by `get()` when an entry is not found, has the same properties that `level-errors` added (`notFound` and `status`) in addition to code `LEVEL_NOT_FOUND`. Those properties will be removed in a future version. Implementations can still yield an error that matches `/NotFound/i.test(err)` or they can start using the code. Either way `abstract-level` will normalize the error.

### 6. Semi-private properties have been removed

The following properties and methods can no longer be accessed, as they've been removed or replaced with internal [symbols](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Symbol):

- `AbstractIterator#_nexting`
- `AbstractIterator#_ended`
- `AbstractChainedBatch#_written`
- `AbstractChainedBatch#_checkWritten()`
- `AbstractChainedBatch#_operations`
- `AbstractLevel#_setupIteratorOptions()`

### 7. Changes to test suite

The abstract test suite of `abstract-level` has some breaking changes compared to `abstract-leveldown`:

- Options to skip tests have been removed in favor of `db.supports`
- Support of `db.clear()` and `db.getMany()` is now mandatory. The default (slow) implementation of `_clear()` has been removed.
- The `setUp` and `tearDown` functions have been removed from the test suite and `suite.common()`.
- Added ability to access manifests via `testCommon.supports`, by lazily copying it from `testCommon.factory().supports`. This requires that the manifest does not change during the lifetime of a `db`.

Many tests were imported from `levelup`, `encoding-down`, `deferred-leveldown`, `memdown`, `level-js` and `leveldown`. They test the changes described above and improve coverage of existing behavior.

Lastly, it's recommended to revisit any custom tests of an implementation. In particular if those tests relied upon the previously loose state checking of `abstract-leveldown`. For example, making a `db.put()` call before `db.open()`. Such a test now has a different meaning. The previous meaning can typically be restored by wrapping tests with `db.once('open', ...)` or `await db.open()` logic.

### 8. Sublevels are builtin

_This section is only relevant if you use [`subleveldown`](https://github.com/Level/subleveldown) (which can not wrap an `abstract-level` database)._

Sublevels are now builtin. If you previously did:

```js
const sub = require('subleveldown')
const example1 = sub(db, 'example1')
const example2 = sub(db, 'example2', { valueEncoding: 'json' })
```

You must now do:

```js
const example1 = db.sublevel('example1')
const example2 = db.sublevel('example2', { valueEncoding: 'json' })
```

The key structure is equal to that of `subleveldown`. This means that an `abstract-level` sublevel can read sublevels previously created with (and populated by) `subleveldown`. There are some new features:

- `db.batch(..)` takes a `sublevel` option on operations, to atomically commit data to multiple sublevels
- Sublevels support Uint8Array in addition to Buffer
- `AbstractLevel#_sublevel()` can be overridden to add additional methods to sublevels.

To reduce function overloads, the prefix argument (`example1` above) is now required and it's called `name` here. If you previously did one of the following, resulting in an empty name:

```js
subleveldown(db)
subleveldown(db, { separator: '@' })
```

You must now use an explicit empty name:

```js
db.sublevel('')
db.sublevel('', { separator: '@' })
```

The string shorthand for `{ separator }` has also been removed. If you previously did:

```js
subleveldown(db, 'example', '@')
```

You must now do:

```js
db.sublevel('example', { separator: '@' })
```

Third, the `open` option has been removed. If you need an asynchronous open hook, feel free to open an issue to discuss restoring this API. Should it support promises? Should `abstract-level` support it on any database and not just sublevels?

Lastly, the error message `Parent database is not open` (courtesy of `subleveldown` which had to check open state to prevent segmentation faults from underlying databases) changed to error code [`LEVEL_DATABASE_NOT_OPEN`](https://github.com/Level/abstract-level#errors) (courtesy of `abstract-level` which does those checks on any database).

---

_For earlier releases, before `abstract-level` was forked from `abstract-leveldown`, please see [the upgrade guide of `abstract-leveldown`](https://github.com/Level/abstract-leveldown/blob/master/UPGRADING.md)._
