'use strict'

const suite = require('level-supports/test')

module.exports = function (test, testCommon) {
  suite(test, testCommon)

  test('manifest has expected properties', async function (t) {
    const db = testCommon.factory()

    t.is(db.supports.deferredOpen, true)

    testCommon.supports = db.supports
    t.ok(testCommon.supports, 'can be accessed via testCommon')

    t.ok(db.supports.encodings.utf8, 'supports utf8')
    t.ok(db.supports.encodings.json, 'supports json')

    return db.close()
  })
}
