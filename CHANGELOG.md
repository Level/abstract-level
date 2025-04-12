# Changelog

## [3.1.0] - 2025-04-12

### Added

- Add `getSync()` method ([#114](https://github.com/Level/abstract-level/issues/114)) ([`30f887d`](https://github.com/Level/abstract-level/commit/30f887d)) (Vincent Weevers)
- Add docs for private `_has()` and `_hasMany()` ([#115](https://github.com/Level/abstract-level/issues/115)) ([`2af4d29`](https://github.com/Level/abstract-level/commit/2af4d29)) (Vincent Weevers)

## [3.0.1] - 2025-01-26

### Added

- Test seeking outside of range options ([#113](https://github.com/Level/abstract-level/issues/113)) ([`90ee9b5`](https://github.com/Level/abstract-level/commit/90ee9b5)) (Vincent Weevers)

## [3.0.0] - 2025-01-05

_Would you mind voting in this [community poll](https://github.com/orgs/Level/discussions/143)? Thank you! If you are upgrading, please see [`UPGRADING.md`](UPGRADING.md)._

### Changed

- **Breaking:** use new language features ([#94](https://github.com/Level/abstract-level/issues/94)) ([`1fdb362`](https://github.com/Level/abstract-level/commit/1fdb362)) (Vincent Weevers)
- **Breaking:** make `iterator.seek()` a mandatory feature ([#105](https://github.com/Level/abstract-level/issues/105)) ([`daf2a88`](https://github.com/Level/abstract-level/commit/daf2a88)) (Vincent Weevers)
- **Breaking:** change `_checkKey` and `_checkValue` to assertions ([#108](https://github.com/Level/abstract-level/issues/108)) ([`ca3c368`](https://github.com/Level/abstract-level/commit/ca3c368)) (Vincent Weevers)

### Added

- Implement explicit snapshots ([#93](https://github.com/Level/abstract-level/issues/93)) ([`a8485a2`](https://github.com/Level/abstract-level/commit/a8485a2), [`f81d348`](https://github.com/Level/abstract-level/commit/f81d348), [`b5b583c`](https://github.com/Level/abstract-level/commit/b5b583c)) (Vincent Weevers)
- Implement `has()` and `hasMany()` ([#96](https://github.com/Level/abstract-level/issues/96)) ([`6684039`](https://github.com/Level/abstract-level/commit/6684039)) (Vincent Weevers)
- Implement `Symbol.asyncDispose` ([#95](https://github.com/Level/abstract-level/issues/95)) ([`eedeed9`](https://github.com/Level/abstract-level/commit/eedeed9)) (Vincent Weevers)
- Add docs and types for `attachResource()` & `detachResource()` ([#110](https://github.com/Level/abstract-level/issues/110)) ([`5f621d4`](https://github.com/Level/abstract-level/commit/5f621d4)) (Vincent Weevers)

### Removed

- **Breaking:** remove deprecated `put`, `del` & `batch` events ([#104](https://github.com/Level/abstract-level/issues/104)) ([`86bd271`](https://github.com/Level/abstract-level/commit/86bd271), [`7c32d39`](https://github.com/Level/abstract-level/commit/7c32d39)) (Vincent Weevers)
- **Breaking:** drop support of Node.js 16 ([#103](https://github.com/Level/abstract-level/issues/103)) ([`a05a8ea`](https://github.com/Level/abstract-level/commit/a05a8ea)) (Vincent Weevers)

### Fixed

- Close sublevels upon closing parent db ([#102](https://github.com/Level/abstract-level/issues/102)) ([`9eeb291`](https://github.com/Level/abstract-level/commit/9eeb291)) (Vincent Weevers)
- Avoid cloning option objects in more places ([#109](https://github.com/Level/abstract-level/issues/109)) ([`efd4175`](https://github.com/Level/abstract-level/commit/efd4175)) (Vincent Weevers)
- Refactor: use async/await in `closeResources()` ([#107](https://github.com/Level/abstract-level/issues/107)) ([`fdb7864`](https://github.com/Level/abstract-level/commit/fdb7864)) (Vincent Weevers)
- Refactor: restore use of spread operator ([#106](https://github.com/Level/abstract-level/issues/106)) ([`a5c2e52`](https://github.com/Level/abstract-level/commit/a5c2e52)) (Vincent Weevers)
- Fix skipped sublevel tests ([`f195d99`](https://github.com/Level/abstract-level/commit/f195d99)) (Vincent Weevers)

## [2.0.2] - 2024-12-09

### Fixed

- Fix TypeScript types of `get`, `getMany`, `nextv` and `all` ([#91](https://github.com/Level/abstract-level/issues/91)) ([`bbcfb04`](https://github.com/Level/abstract-level/commit/bbcfb04)) (Junxiao Shi)

## [2.0.1] - 2024-10-21

### Fixed

- Generalize prewrite test for memory-level ([#90](https://github.com/Level/abstract-level/issues/90)) ([`9ea8770`](https://github.com/Level/abstract-level/commit/9ea8770)) (Vincent Weevers)

## [2.0.0] - 2024-02-03

_If you are upgrading, please see [`UPGRADING.md`](UPGRADING.md)._

### Changed

- **Breaking:** remove callbacks in favor of promises ([#50](https://github.com/Level/abstract-level/issues/50)) ([`f97dbae`](https://github.com/Level/abstract-level/commit/f97dbae)) (Vincent Weevers)
- **Breaking:** use `undefined` instead of error for non-existing entries ([#49](https://github.com/Level/abstract-level/issues/49)) ([`1e08b30`](https://github.com/Level/abstract-level/commit/1e08b30)) (Vincent Weevers)
- **Breaking:** add hooks and deprecate `batch`, `put` & `del` events ([#45](https://github.com/Level/abstract-level/issues/45), [#53](https://github.com/Level/abstract-level/issues/53), [#81](https://github.com/Level/abstract-level/issues/81)) ([`bcb4192`](https://github.com/Level/abstract-level/commit/bcb4192), [`bee1085`](https://github.com/Level/abstract-level/commit/bee1085), [`dbcf7d7`](https://github.com/Level/abstract-level/commit/dbcf7d7)) (Vincent Weevers)
- **Breaking:** require snapshots to be created synchronously ([#54](https://github.com/Level/abstract-level/issues/54)) ([`d89e68e`](https://github.com/Level/abstract-level/commit/d89e68e)) (Vincent Weevers).

### Added

- Add experimental support of `AbortSignal` ([#55](https://github.com/Level/abstract-level/issues/55), [#59](https://github.com/Level/abstract-level/issues/59)) ([`b075a25`](https://github.com/Level/abstract-level/commit/b075a25), [`e3fba20`](https://github.com/Level/abstract-level/commit/e3fba20)) (Vincent Weevers)
- Expose path of sublevel ([#78](https://github.com/Level/abstract-level/issues/78)) ([`20974f6`](https://github.com/Level/abstract-level/commit/20974f6)) (Vincent Weevers).

### Removed

- **Breaking:** drop Node.js < 16 ([`9e8f561`](https://github.com/Level/abstract-level/commit/9e8f561)) (Vincent Weevers)
- **Breaking:** remove deferred chained batch ([#51](https://github.com/Level/abstract-level/issues/51), [#58](https://github.com/Level/abstract-level/issues/58)) ([`fc7be7b`](https://github.com/Level/abstract-level/commit/fc7be7b), [`e119cad`](https://github.com/Level/abstract-level/commit/e119cad)) (Vincent Weevers)
- **Breaking:** remove `ready` alias of `open` event ([#48](https://github.com/Level/abstract-level/issues/48)) ([`5f7b923`](https://github.com/Level/abstract-level/commit/5f7b923)) (Vincent Weevers)
- Remove compatibility checks for `levelup` & friends ([#52](https://github.com/Level/abstract-level/issues/52)) ([`def791f`](https://github.com/Level/abstract-level/commit/def791f)) (Vincent Weevers).

### Fixed

- Keep track of iterator end ([#56](https://github.com/Level/abstract-level/issues/56)) ([`9b78443`](https://github.com/Level/abstract-level/commit/9b78443)) (Vincent Weevers).

## [1.0.4] - 2024-01-20

### Fixed

- Fix TypeScript definitions of `all()` and `nextv()` ([#67](https://github.com/Level/abstract-level/issues/67)) ([`8e85993`](https://github.com/Level/abstract-level/commit/8e85993), [`9f17757`](https://github.com/Level/abstract-level/commit/9f17757)) (Bryan)

## [1.0.3] - 2022-03-20

### Added

- Document error codes of `classic-level` and `many-level` ([#20](https://github.com/Level/abstract-level/issues/20)) ([`4b3464c`](https://github.com/Level/abstract-level/commit/4b3464c)) (Vincent Weevers)

### Fixed

- Add hidden `abortOnClose` option to iterators ([`2935180`](https://github.com/Level/abstract-level/commit/2935180)) (Vincent Weevers)
- Make internal iterator decoding options enumerable ([`eb08363`](https://github.com/Level/abstract-level/commit/eb08363)) (Vincent Weevers)
- Restore Sauce Labs browser tests ([`90b8816`](https://github.com/Level/abstract-level/commit/90b8816)) (Vincent Weevers)

## [1.0.2] - 2022-03-06

### Fixed

- Fix TypeScript declaration of chained batch `write()` options ([`392b7f7`](https://github.com/Level/abstract-level/commit/392b7f7)) (Vincent Weevers)
- Document the return type of `db.batch()` and add example ([`9739bba`](https://github.com/Level/abstract-level/commit/9739bba)) (Vincent Weevers)

## [1.0.1] - 2022-02-06

### Fixed

- Add `highWaterMarkBytes` option to tests where it matters ([`6b25a91`](https://github.com/Level/abstract-level/commit/6b25a91)) (Vincent Weevers)
- Clarify the meaning of `db.status` ([`2e90b05`](https://github.com/Level/abstract-level/commit/2e90b05)) (Vincent Weevers)
- Use `new` in README examples ([`379503e`](https://github.com/Level/abstract-level/commit/379503e)) (Vincent Weevers).

## [1.0.0] - 2022-01-30

_:seedling: Initial release. If you are upgrading from `abstract-leveldown` please see [`UPGRADING.md`](UPGRADING.md)_

[3.1.0]: https://github.com/Level/abstract-level/releases/tag/v3.1.0

[3.0.1]: https://github.com/Level/abstract-level/releases/tag/v3.0.1

[3.0.0]: https://github.com/Level/abstract-level/releases/tag/v3.0.0

[2.0.2]: https://github.com/Level/abstract-level/releases/tag/v2.0.2

[2.0.1]: https://github.com/Level/abstract-level/releases/tag/v2.0.1

[2.0.0]: https://github.com/Level/abstract-level/releases/tag/v2.0.0

[1.0.4]: https://github.com/Level/abstract-level/releases/tag/v1.0.4

[1.0.3]: https://github.com/Level/abstract-level/releases/tag/v1.0.3

[1.0.2]: https://github.com/Level/abstract-level/releases/tag/v1.0.2

[1.0.1]: https://github.com/Level/abstract-level/releases/tag/v1.0.1

[1.0.0]: https://github.com/Level/abstract-level/releases/tag/v1.0.0
