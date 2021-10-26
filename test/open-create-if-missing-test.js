'use strict'

// TODO: test options via constructor
exports.createIfMissing = function (test, testCommon) {
  test('test database open createIfMissing:false', function (t) {
    const db = testCommon.factory()
    let async = false

    db.open({ createIfMissing: false }, function (err) {
      t.ok(err, 'error')
      t.ok(/does not exist/.test(err.message), 'error is about dir not existing')
      t.ok(async, 'callback is asynchronous')
      t.end()
    })

    async = true
  })
}

exports.all = function (test, testCommon) {
  exports.createIfMissing(test, testCommon)
}
