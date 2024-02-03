'use strict'

exports.prefixDescendantKey = function (key, keyFormat, descendant, ancestor) {
  while (descendant !== null && descendant !== ancestor) {
    key = descendant.prefixKey(key, keyFormat, true)
    descendant = descendant.parent
  }

  return key
}

// Check if db is a descendant of ancestor
// TODO: optimize, when used alongside prefixDescendantKey
// which means we visit parents twice.
exports.isDescendant = function (db, ancestor) {
  while (true) {
    if (db.parent == null) return false
    if (db.parent === ancestor) return true
    db = db.parent
  }
}
