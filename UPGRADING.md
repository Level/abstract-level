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
  - [3. Auto-closing resources](#3-auto-closing-resources)
    - [3.1. Closing iterators is idempotent](#31-closing-iterators-is-idempotent)
    - [3.2. Chained batch can be closed](#32-chained-batch-can-be-closed)
  - [4. Error codes](#4-error-codes)
  - [5. Removed semi-private properties](#5-removed-semi-private-properties)
  - [6. Breaking changes to test suite](#6-breaking-changes-to-test-suite)
- [7.0.0](#700)
- [6.0.0](#600)
  - [Changes to public API](#changes-to-public-api)
    - [Nullish values are rejected](#nullish-values-are-rejected)
    - [Range options are serialized](#range-options-are-serialized)
    - [The rules for range options have been relaxed](#the-rules-for-range-options-have-been-relaxed)
    - [Zero-length array keys are rejected](#zero-length-array-keys-are-rejected)
    - [No longer assumes support of boolean and `NaN` keys](#no-longer-assumes-support-of-boolean-and-nan-keys)
    - [Browser support](#browser-support)
  - [Changes to private API](#changes-to-private-api)
    - [`location` was removed](#location-was-removed)
    - [Abstract test suite has moved to a single entry point](#abstract-test-suite-has-moved-to-a-single-entry-point)
    - [The `collectEntries` utility has moved](#the-collectentries-utility-has-moved)
    - [Setup and teardown became noops](#setup-and-teardown-became-noops)
    - [Optional tests have been separated](#optional-tests-have-been-separated)
    - [Iterator must have a `db` reference](#iterator-must-have-a-db-reference)
    - [Seeking became part of official API](#seeking-became-part-of-official-api)
    - [Chained batch has been refactored](#chained-batch-has-been-refactored)
    - [Default `_serializeKey` and `_serializeValue` became identity functions](#default-_serializekey-and-_serializevalue-became-identity-functions)
- [5.0.0](#500)
- [4.0.0](#400)
  - - [default `testCommon` parameter](#default-testcommon-parameter)
    - [`testBuffer` parameter removed](#testbuffer-parameter-removed)
    - [`.approximateSize` method removed](#approximatesize-method-removed)
    - [`._isBuffer` method removed](#_isbuffer-method-removed)
    - [`isLevelDOWN` function removed](#isleveldown-function-removed)
    - [`ranges-test.js` renamed](#ranges-testjs-renamed)
- [3.0.0](#300)

</details>

## Upcoming

**This release removes the need for `levelup`, `encoding-down`, `deferred-leveldown` and `level-packager`. This means that an `abstract-level` database is a complete solution that doesn't need to be wrapped. It has the same API as `level(up)` including encodings, promises and events. In addition, implementations can choose to use Uint8Array for keys and values instead of Buffer. Consumers of an implementation can use both.**

Support of Node.js 10 has been dropped.

For most folks, a database that upgraded from `abstract-leveldown` to `abstract-level` can be a drop-in replacement for a `level(up)` database. Let's start this upgrade guide there: all methods have been enhanced and tuned to reach API parity with `levelup` and `level`.

### 1. API parity with `levelup`

#### 1.1. New: Promise support

All methods that take a callback now also support promises. They return a promise if no callback is provided, the same as `levelup`. Implementations that override public (non-underscored) methods _must_ do the same and any implementation _should_ do the same for additional methods if any.

#### 1.2. New: events & idempotent open

The prototype of `require('abstract-level').AbstractLevelDOWN` inherits from `require('events').EventEmitter`. Opening and closing is idempotent and safe, and an instance emits the same events as `levelup` would (with the exception of the 'ready' alias that `levelup` has for the 'open' event - `abstract-level` only emits 'open').

#### 1.3. New: deferred open

Deferred open is built-in. This means an `abstract-level` database opens itself a tick after its constructor returns (unless `open()` was called in the mean time). Any operations made until opening has completed are queued up in memory. When opening completes the operations are replayed. If opening failed (and this is a new behavior compared to `levelup`) the operations will yield errors. The `abstract-level` prototype has a new `defer()` method for an implementation to defer custom operations.

The initial `status` of an `abstract-level` database is 'opening' rather than 'new', which no longer exists. Wrapping an `abstract-level` database with `levelup` or `deferred-leveldown` is not supported and will exhibit undefined behavior.

#### 1.4. New: state checks

On any operation, an `abstract-level` database checks if it's open. If not, it will either throw an error (if the relevant API is synchronous) or asynchronously yield an error. For example:

```js
try {
  db.iterator()
} catch (err) {
  console.log(err.code) // LEVEL_DATABASE_NOT_OPEN
}
```

_Errors now have a `code` property. More on that below._

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

It was previously necessary to use `level` (or similar: `level-mem`, `level-rocksdb` and more) to get the "full experience". These modules combined an `abstract-leveldown` implementation with `encoding-down` and `levelup`, using the `level-packager` utility. Encodings are now built-in to `abstract-level`. A future version of `level` will likely simply export `leveldown` in Node.js and `level-js` in browsers.

#### 2.1. New: encodings

All relevant methods including the `AbstractLevelDOWN` constructor now accept `keyEncoding` and `valueEncoding` options. Read operations now yield strings rather than buffers by default, to align with `level` and friends.

Both the public and private API of `abstract-leveldown` are encoding-aware. This means that private methods receive `keyEncoding` and `valueEncoding` options too, instead of `keyAsBuffer`, `valueAsBuffer` or `asBuffer`. Implementations don't need to perform encoding or decoding themselves. In fact they can do less: the `_serializeKey()` and `_serializeValue()` methods are also gone and implementations like `memdown` don't have to convert between strings and buffers.

For example: a call like `db.put(key, { x: 2 }, { valueEncoding: 'json' })` will encode the `{ x: 2 }` value and might forward it to the private API as `db._put(key, '{"x":2}', { valueEncoding: 'utf8' }, callback)`. Same for the key (omitted for brevity).

The encoding options and data received by the private API depend on which encodings it supports. It must declare those via the manifest passed to the `AbstractLevelDOWN` constructor. See README for details. For example, an implementation might only support storing data as Uint8Arrays, known here as a "view":

```js
AbstractLevelDOWN({ encodings: { view: true } })
```

The JSON example above would then result in `db._put(key, value, { valueEncoding: 'view' })` where `value` is a Uint8Array containing JSON. Implementations can also declare support of multiple encodings; keys and values will then be encoded via the most optimal path.

There are a few differences from `level` and `encoding-down`. Some breaking:

- The `ascii`, `ucs2` and `utf16le` encodings are not supported
- The `id` encoding (aliased as `none`) which wasn't supported by any active `abstract-leveldown` implementation, has been removed
- The undocumented `encoding` option (as an alias for `valueEncoding`) is not supported.

And non-breaking:

- The `binary` encoding has been renamed to `buffer`, with `binary` as an alias
- The `utf8` encoding previously did not touch Buffers. Now it will call `buffer.toString('utf8')` for consistency. Consumers can use the `buffer` encoding to avoid this conversion.

#### 2.2. Other notable changes

- Zero-length keys and range options are now valid. Historically they weren't supported for causing segmentation faults in `leveldown`. That doesn't apply to today's codebase.
- The `AbstractIterator` constructor now requires an `options` argument
- The `AbstractIterator#_seek()` method got a new `options` argument
- The `db.supports.bufferKeys` property has been removed.

### 3. Auto-closing resources

To further improve safety and consistency, additional changes were made that make an `abstract-level` database safer to use than `abstract-leveldown` wrapped with `levelup`.

#### 3.1. Closing iterators is idempotent

The `iterator.end()` method has been renamed to `iterator.close()`, with `end()` being an alias until a next major version in the future. The term "close" makes it easier to differentiate between the iterator having reached its natural end (data-wise) versus closing it to cleanup resources.

Likewise, `_end()` has been renamed to `_close()` but without an alias. This method is no longer allowed to yield an error.

On `db.close()`, non-closed iterators are now automatically closed. This may be a breaking change but only if an implementation has (at its own risk) overridden the public `end()` method, because `close()` or `end()` is now an idempotent operation rather than yielding an `end() already called on iterator` error. If a `next()` is in progress, closing the iterator (or database) will wait for that.

The error message `cannot call next() after end()` has been replaced with code `LEVEL_ITERATOR_NOT_OPEN`, the error `cannot call seek() after end()` has been removed in favor of a silent return, and `cannot call next() before previous next() has completed` and `cannot call seek() before next() has completed` have been replaced with code `LEVEL_ITERATOR_BUSY`.

The `next()` method no longer returns `this` (when a callback is provided).

#### 3.2. Chained batch can be closed

Chained batch has a new method `close()` which is an idempotent operation and automatically called after `write()` (for backwards compatibility) or on `db.close()`. This to ensure batches can't be used after closing and reopening a db. If a `write()` is in progress, closing will wait for that. If `write()` is never called then `close()` must be.

These changes could be breaking for an implementation that has (at its own risk) overridden the public `write()` method. In addition, the error message `write() already called on this batch` has been replaced with code `LEVEL_BATCH_NOT_OPEN`.

### 4. Error codes

The [`level-errors`](https://github.com/Level/errors) module as used by `levelup` and friends, is not used or exposed by `abstract-level`. Instead errors thrown or yielded from a database have a `code` property. See [`README`](./README.md#errors) for details. Going forward, the semver contract will be on `code` and error messages will change without a semver-major bump.

To minimize breakage, the most used error as yielded by `get()` when an entry is not found, has the same properties that `level-errors` added (`notFound` and `status`) in addition to code `LEVEL_NOT_FOUND`. Those properties will be removed in a future version. Implementations can still yield an error that matches `/NotFound/i.test(err)` or they can start using the code. Either way `abstract-level` will normalize the error.

### 5. Removed semi-private properties

The following properties and methods can no longer be accessed, as they've been removed or replaced with internal [symbols](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Symbol):

- `AbstractIterator#_nexting`
- `AbstractIterator#_ended`
- `AbstractChainedBatch#_written`
- `AbstractChainedBatch#_checkWritten()`
- `AbstractChainedBatch#_operations`
- `AbstractLevelDOWN#_setupIteratorOptions()`

### 6. Breaking changes to test suite

- Options to skip tests have been removed in favor of `db.supports`
- Support of `db.clear()` and `db.getMany()` is now mandatory. The default (slow) implementation of `_clear()` has been removed.
- The `setUp` and `tearDown` functions have been removed from the test suite and `suite.common()`.
- Added ability to access manifests via `testCommon.supports`, by lazily copying it from `testCommon.factory().supports`. This requires that the manifest does not change during the lifetime of a `db`.
- Many tests were imported from `levelup`, `encoding-down`, `deferred-leveldown`, `memdown`, `level-js` and `leveldown`. They test the changes described above and improve coverage of existing behavior.

Lastly, it's recommended to revisit any custom tests of an implementation. In particular if those tests relied upon the previously loose state checking of `abstract-leveldown`. For example, making a `db.put()` call before `db.open()`. Such a test now has a different meaning. The previous meaning can typically be restored by wrapping tests with `db.once('open', ...)` or `await db.open()` logic.

## 7.0.0

Legacy range options have been removed ([Level/community#86](https://github.com/Level/community/issues/86)). If you previously did:

```js
db.iterator({ start: 'a', end: 'z' })
```

An error would now be thrown and you must instead do:

```js
db.iterator({ gte: 'a', lte: 'z' })
```

This release also drops support of legacy runtime environments ([Level/community#98](https://github.com/Level/community/issues/98)):

- Node.js 6 and 8
- Internet Explorer 11
- Safari 9-11
- Stock Android browser (AOSP).

Lastly, and less likely to be a breaking change, the [`immediate`](https://github.com/calvinmetcalf/immediate) browser shim for `process.nextTick()` has been replaced with the smaller [`queue-microtask`](https://github.com/feross/queue-microtask). In the future we might use `queueMicrotask` in Node.js too.

## 6.0.0

This release brings a major refactoring of the test suite, decouples `abstract-leveldown` from disk-based implementations and solves long-standing issues around serialization and type support. Because the changes are substantial, this guide has two sections:

1. **Changes to public API** - for consumers of any implementation.
2. **Changes to private API** - intended for implementors.

### Changes to public API

#### Nullish values are rejected

In addition to rejecting `null` and `undefined` as _keys_, `abstract-leveldown` now also rejects these types as _values_, due to preexisting significance in streams and iterators.

Before this, the behavior of these types depended on a large number of factors: `_serializeValue` and type support of the underlying storage, whether `get()`, `iterator()` or a stream was used to retrieve values, the `keys` and `asBuffer` options of `iterator()` and finally, which encoding was selected.

#### Range options are serialized

Previously, range options like `lt` were passed through as-is, unlike keys.

#### The rules for range options have been relaxed

Because `null`, `undefined`, zero-length strings and zero-length buffers are significant types in encodings like `bytewise` and `charwise`, they became valid as range options. In fact, any type is now valid. This means `db.iterator({ gt: undefined })` is not the same as `db.iterator({})`.

Furthermore, `abstract-leveldown` makes no assumptions about the meaning of these types. Range tests that assumed `null` meant "not defined" have been removed.

#### Zero-length array keys are rejected

Though this was already the case because `_checkKey` stringified its input before checking the length, that behavior has been replaced with an explicit `Array.isArray()` check and a new error message.

#### No longer assumes support of boolean and `NaN` keys

A test that asserted boolean and `NaN` keys were valid has been removed.

#### Browser support

IE10 has been dropped.

### Changes to private API

#### `location` was removed

`AbstractLevelDOWN` is no longer associated with a `location`. It's up to the implementation to handle it if it's required.

If your implementation has a `location` and you previously did:

```js
function YourDOWN (location) {
  AbstractLevelDOWN.call(this, location)
}
```

You must now do:

```js
function YourDOWN (location) {
  this.location = location
  AbstractLevelDOWN.call(this)
}
```

Be sure to include appropriate type checks. If you relied on the default `AbstractLevelDOWN` behavior that would be:

```js
if (typeof location !== 'string') {
  throw new Error('constructor requires a location string argument')
}
```

#### Abstract test suite has moved to a single entry point

Instead of including test files individually, you can and should include the test suite with one `require()` statement. If you previously did:

```js
const test = require('tape')
const testCommon = require('abstract-leveldown/testCommon')
const YourDOWN = require('.')

require('abstract-leveldown/abstract/get-test').all(YourDOWN, test, testCommon)
require('abstract-leveldown/abstract/put-test').all(YourDOWN, test, testCommon)

// etc
```

You must now do:

```js
const test = require('tape')
const suite = require('abstract-leveldown/test')
const YourDOWN = require('.')

suite({
  test: test,
  factory: function () {
    return new YourDOWN()
  }
})
```

The input to the test suite is a new form of `testCommon`. Should you need to reuse `testCommon` for your own (additional) tests, use the included utility to create a `testCommon` with defaults:

```js
const test = require('tape')
const suite = require('abstract-leveldown/test')
const YourDOWN = require('.')

const testCommon = suite.common({
  test: test,
  factory: function () {
    return new YourDOWN()
  }
})

suite(testCommon)
```

As part of removing `location`, the abstract tests no longer use `testCommon.location()`. Instead an implementation _must_ implement `factory()` which _must_ return a unique and isolated database instance. This allows implementations to pass options to their constructor.

The `testCommon.cleanup` method has been removed. Because `factory()` returns a unique database instance, cleanup should no longer be necessary. The `testCommon.lastLocation` method has also been removed as there is no remaining use of it in abstract tests.

Previously, implementations using the default `testCommon` had to include `rimraf` in their `devDependencies` and browser-based implementations had to exclude `rimraf` from browserify builds. This is no longer the case.

If your implementation is disk-based we recommend using [`tempy`](https://github.com/sindresorhus/tempy) (or similar) to create unique temporary directories. Together with `factory()` your setup could now look something like:

```js
const test = require('tape')
const tempy = require('tempy')
const suite = require('abstract-leveldown/test')
const YourDOWN = require('.')

suite({
  test: test,
  factory: function () {
    return new YourDOWN(tempy.directory())
  }
})
```

#### The `collectEntries` utility has moved

The `testCommon.collectEntries` method has moved to the npm package  `level-concat-iterator`. If your (additional) tests depend on `collectEntries` and you previously did:

```js
testCommon.collectEntries(iterator, function (err, entries) {})
```

You must now do:

```js
const concat = require('level-concat-iterator')
concat(iterator, function (err, entries) {})
```

#### Setup and teardown became noops

Because cleanup is no longer necessary, the `testCommon.setUp` and `testCommon.tearDown` methods are now noops by default. If you do need to perform (a)synchronous work before or after each test, `setUp` and `tearDown` can be overridden:

```js
suite({
  // ..
  setUp: function (t) {
    t.end()
  },
  tearDown: function (t) {
    t.end()
  }
})
```

#### Optional tests have been separated

If your implementation does not support snapshots or other optional features, the relevant tests may be skipped. For example:

```js
suite({
  // ..
  snapshots: false
})
```

Please see the [README](README.md) for a list of options. Note that some of these have replaced `process.browser` checks.

#### Iterator must have a `db` reference

The `db` argument of the `AbstractIterator` constructor became mandatory, as well as a public `db` property on the instance. Its existence is not new; the test suite now asserts that your implementation also has it.

#### Seeking became part of official API

If your implementation previously defined the public `iterator.seek(target)`, it must now define the private `iterator._seek(target)`. The new public API is equal to the reference implementation of `leveldown` except for two differences:

- The `target` argument is not type checked, this is up to the implementation.
- The `target` argument is passed through `db._serializeKey`.

Please see the [README](README.md) for details.

#### Chained batch has been refactored

- The default `_clear` method is no longer a noop; instead it clears the operations queued by `_put` and/or `_del`
- The `_write` method now takes an `options` object as its first argument
- The `db` argument of the `AbstractChainedBatch` constructor became mandatory, as well as a public `db` property on the instance, which was previously named `_db`.

#### Default `_serializeKey` and `_serializeValue` became identity functions

They return whatever is given. Previously they were opinionated and mostly geared towards string- and Buffer-based storages. Implementations that didn't already define their own serialization should now do so, according to the types that they support. Please refer to the [README](README.md) for recommended behavior.

## 5.0.0

Dropped support for node 4. No other breaking changes.

## 4.0.0

#### default `testCommon` parameter

The `testCommon` parameter will now default to `abstract-leveldown/testCommon.js`. You can omit this parameter, unless your implementation needs a custom version.

If your code today looks something like:

```js
const test = require('tape')
const testCommon = require('abstract-leveldown/testCommon')
const leveldown = require('./your-leveldown')
const abstract = require('abstract-leveldown/abstract/get-test')

abstract.all(leveldown, test, testCommon)
```

You can simplify it to:

```js
const test = require('tape')
const leveldown = require('./your-leveldown')
const abstract = require('abstract-leveldown/abstract/get-test')

abstract.all(leveldown, test)
```

#### `testBuffer` parameter removed

The `abstract/put-get-del-test.js` previously took a custom `testBuffer` parameter. After an [analysis](https://github.com/Level/abstract-leveldown/pull/175#issuecomment-353867144) of various implementations we came to the conclusion that the parameter has no use.

If your implementation is using this abstract test, change from:

```js
const test = require('tape')
const testCommon = require('abstract-leveldown/testCommon')
const leveldown = require('./your-leveldown')
const fs = require('fs')
const path = require('path')
const testBuffer = fs.readFileSync(path.join(__dirname, 'data/testdata.bin'))
const abstract = require('abstract-leveldown/abstract/put-get-del-test')

abstract.all(leveldown, test, testBuffer, testCommon)
```

to:

```js
const test = require('tape')
const testCommon = require('abstract-leveldown/testCommon')
const leveldown = require('./your-leveldown')
const abstract = require('abstract-leveldown/abstract/put-get-del-test')

abstract.all(leveldown, test, testCommon)
```

or if `testCommon` is also redundant, to:

```js
const test = require('tape')
const leveldown = require('./your-leveldown')
const abstract = require('abstract-leveldown/abstract/put-get-del-test')

abstract.all(leveldown, test)
```

#### `.approximateSize` method removed

The `.approximateSize` method has been removed from the public API. It is heavily related to `LevelDB` and more often than not, other stores lack the native primitives to implement this. If you did implement the internal `_approximateSize` method, that is now dead code. To preserve the method in your public API, rename it to `approximateSize` and also take care of the initialization code. Look to `leveldown` for inspiration.

Also, the corresponding abstract tests have been removed, so your implementation can no longer require `abstract/approximate-size-test`.

#### `._isBuffer` method removed

Because `Buffer` is available in all environments nowadays, there is no need for alternatives like typed arrays. It is preferred to use `Buffer` and `Buffer.isBuffer()` directly.

#### `isLevelDOWN` function removed

This was a legacy function.

#### `ranges-test.js` renamed

We have refactored a lot of the tests. Specifically the iterator tests were split in two and in that process we renamed `ranges-test.js` to `iterator-range-test.js`.

If your implementation is using these tests then change from:

```js
const abstract = require('abstract-leveldown/abstract/ranges-test')
```

to:

```js
const abstract = require('abstract-leveldown/abstract/iterator-range-test')
```

## 3.0.0

No changes to the API. New major version because support for node 0.12 was dropped.
