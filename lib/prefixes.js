'use strict'

exports.prefixDescendantKey = function (key, keyFormat, descendant, ancestor) {
  // TODO: optimize
  // TODO: throw when ancestor is not descendant's ancestor?
  while (descendant !== null && descendant !== ancestor) {
    key = descendant.prefixKey(key, keyFormat, true)
    descendant = descendant.parent
  }

  return key
}
