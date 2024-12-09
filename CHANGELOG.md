# Changelog

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

[2.0.2]: https://github.com/Level/abstract-level/releases/tag/v2.0.2

[2.0.1]: https://github.com/Level/abstract-level/releases/tag/v2.0.1

[2.0.0]: https://github.com/Level/abstract-level/releases/tag/v2.0.0

[1.0.4]: https://github.com/Level/abstract-level/releases/tag/v1.0.4

[1.0.3]: https://github.com/Level/abstract-level/releases/tag/v1.0.3

[1.0.2]: https://github.com/Level/abstract-level/releases/tag/v1.0.2

[1.0.1]: https://github.com/Level/abstract-level/releases/tag/v1.0.1

[1.0.0]: https://github.com/Level/abstract-level/releases/tag/v1.0.0
