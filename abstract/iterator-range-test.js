var db

module.exports.setUp = function (leveldown, test, testCommon, data) {
  test('setUp common', testCommon.setUp)
  test('setUp db', function (t) {
    db = leveldown(testCommon.location())
    db.open(function () {
      db.batch(data.map(function (d) {
        return {
          type: 'put',
          key: d.key,
          value: d.value
        }
      }), t.end.bind(t))
    })
  })
}

module.exports.range = function (leveldown, test, testCommon, data) {
  var collectEntries = testCommon.collectEntries

  function rangeTest (name, opts, expected) {
    opts.keyAsBuffer = false
    opts.valueAsBuffer = false
    test(name, function (t) {
      collectEntries(db.iterator(opts), function (err, result) {
        t.error(err)
        t.is(result.length, expected.length, 'correct number of entries')
        t.same(result, expected)
        t.end()
      })
    })
  }

  rangeTest('test full data collection', {}, data)

  rangeTest('test iterator with reverse=true', {
    reverse: true
  }, data.slice().reverse())

  rangeTest('test iterator with gte=00', {
    gte: '00'
  }, data)

  rangeTest('test iterator with start=00 - legacy', {
    start: '00'
  }, data)

  rangeTest('test iterator with gte=50', {
    gte: '50'
  }, data.slice(50))

  rangeTest('test iterator with start=50 - legacy', {
    start: '50'
  }, data.slice(50))

  rangeTest('test iterator with lte=50 and reverse=true', {
    lte: '50',
    reverse: true
  }, data.slice().reverse().slice(49))

  rangeTest('test iterator with start=50 and reverse=true - legacy', {
    start: '50',
    reverse: true
  }, data.slice().reverse().slice(49))

  rangeTest('test iterator with gte=49.5 (midway)', {
    gte: '49.5'
  }, data.slice(50))

  rangeTest('test iterator with start=49.5 (midway) - legacy', {
    start: '49.5'
  }, data.slice(50))

  rangeTest('test iterator with gte=49999 (midway)', {
    gte: '49999'
  }, data.slice(50))

  rangeTest('test iterator with start=49999 (midway) - legacy', {
    start: '49999'
  }, data.slice(50))

  rangeTest('test iterator with lte=49.5 (midway) and reverse=true', {
    lte: '49.5',
    reverse: true
  }, data.slice().reverse().slice(50))

  rangeTest('test iterator with lt=49.5 (midway) and reverse=true', {
    lt: '49.5',
    reverse: true
  }, data.slice().reverse().slice(50))

  rangeTest('test iterator with lt=50 and reverse=true', {
    lt: '50',
    reverse: true
  }, data.slice().reverse().slice(50))

  rangeTest('test iterator with start=49.5 (midway) and reverse=true - legacy', {
    start: '49.5',
    reverse: true
  }, data.slice().reverse().slice(50))

  rangeTest('test iterator with lte=50', {
    lte: '50'
  }, data.slice(0, 51))

  rangeTest('test iterator with end=50 - legacy', {
    end: '50'
  }, data.slice(0, 51))

  rangeTest('test iterator with lte=50.5 (midway)', {
    lte: '50.5'
  }, data.slice(0, 51))

  rangeTest('test iterator with end=50.5 (midway) - legacy', {
    end: '50.5'
  }, data.slice(0, 51))

  rangeTest('test iterator with lte=50555 (midway)', {
    lte: '50555'
  }, data.slice(0, 51))

  rangeTest('test iterator with lt=50555 (midway)', {
    lt: '50555'
  }, data.slice(0, 51))

  rangeTest('test iterator with end=50555 (midway) - legacy', {
    end: '50555'
  }, data.slice(0, 51))

  rangeTest('test iterator with gte=50.5 (midway) and reverse=true', {
    gte: '50.5',
    reverse: true
  }, data.slice().reverse().slice(0, 49))

  rangeTest('test iterator with gt=50.5 (midway) and reverse=true', {
    gt: '50.5',
    reverse: true
  }, data.slice().reverse().slice(0, 49))

  rangeTest('test iterator with end=50.5 (midway) and reverse=true - legacy', {
    end: '50.5',
    reverse: true
  }, data.slice().reverse().slice(0, 49))

  rangeTest('test iterator with gt=50 and reverse=true', {
    gt: '50',
    reverse: true
  }, data.slice().reverse().slice(0, 49))

  // end='0', starting key is actually '00' so it should avoid it
  rangeTest('test iterator with lte=0', {
    lte: '0'
  }, [])

  // end='0', starting key is actually '00' so it should avoid it
  rangeTest('test iterator with lt=0', {
    lt: '0'
  }, [])

  // end='0', starting key is actually '00' so it should avoid it
  rangeTest('test iterator with end=0 - legacy', {
    end: '0'
  }, [])

  rangeTest('test iterator with gte=30 and lte=70', {
    gte: '30',
    lte: '70'
  }, data.slice(30, 71))

  rangeTest('test iterator with gt=29 and lt=71', {
    gt: '29',
    lt: '71'
  }, data.slice(30, 71))

  rangeTest('test iterator with start=30 and end=70 - legacy', {
    start: '30',
    end: '70'
  }, data.slice(30, 71))

  rangeTest('test iterator with gte=30 and lte=70 and reverse=true', {
    lte: '70',
    gte: '30',
    reverse: true
  }, data.slice().reverse().slice(29, 70))

  rangeTest('test iterator with gt=29 and lt=71 and reverse=true', {
    lt: '71',
    gt: '29',
    reverse: true
  }, data.slice().reverse().slice(29, 70))

  rangeTest('test iterator with start=70 and end=30 and reverse=true - legacy', {
    start: '70',
    end: '30',
    reverse: true
  }, data.slice().reverse().slice(29, 70))

  rangeTest('test iterator with limit=20', {
    limit: 20
  }, data.slice(0, 20))

  rangeTest('test iterator with limit=20 and gte=20', {
    limit: 20,
    gte: '20'
  }, data.slice(20, 40))

  rangeTest('test iterator with limit=20 and start=20 - legacy', {
    limit: 20,
    start: '20'
  }, data.slice(20, 40))

  rangeTest('test iterator with limit=20 and reverse=true', {
    limit: 20,
    reverse: true
  }, data.slice().reverse().slice(0, 20))

  rangeTest('test iterator with limit=20 and lte=79 and reverse=true', {
    limit: 20,
    lte: '79',
    reverse: true
  }, data.slice().reverse().slice(20, 40))

  rangeTest('test iterator with limit=20 and start=79 and reverse=true - legacy', {
    limit: 20,
    start: '79',
    reverse: true
  }, data.slice().reverse().slice(20, 40))

  // the default limit value from levelup is -1
  rangeTest('test iterator with limit=-1 should iterate over whole database', {
    limit: -1
  }, data)

  rangeTest('test iterator with limit=0 should not iterate over anything', {
    limit: 0
  }, [])

  rangeTest('test iterator with lte after limit', {
    limit: 20,
    lte: '50'
  }, data.slice(0, 20))

  rangeTest('test iterator with end after limit - legacy', {
    limit: 20,
    end: '50'
  }, data.slice(0, 20))

  rangeTest('test iterator with lte before limit', {
    limit: 50,
    lte: '19'
  }, data.slice(0, 20))

  rangeTest('test iterator with end before limit - legacy', {
    limit: 50,
    end: '19'
  }, data.slice(0, 20))

  rangeTest('test iterator with gte after database end', {
    gte: '9a'
  }, [])

  rangeTest('test iterator with gt after database end', {
    gt: '9a'
  }, [])

  rangeTest('test iterator with start after database end - legacy', {
    start: '9a'
  }, [])

  rangeTest('test iterator with lte after database end and reverse=true', {
    lte: '9a',
    reverse: true
  }, data.slice().reverse())

  rangeTest('test iterator with start after database end and reverse=true - legacy', {
    start: '9a',
    reverse: true
  }, data.slice().reverse())

  rangeTest('test iterator with lte and gte after database and reverse=true', {
    lte: '9b',
    gte: '9a',
    reverse: true
  }, [])

  rangeTest('test iterator with lt and gt after database and reverse=true', {
    lt: '9b',
    gt: '9a',
    reverse: true
  }, [])

  rangeTest('test iterator with start and end after database and reverse=true - legacy', {
    start: '9b',
    end: '9a',
    reverse: true
  }, [])

  if (!process.browser) {
    // Can't use buffers as query keys in indexeddb (I think :P)
    rangeTest('test iterator with gte as empty buffer', {
      gte: Buffer.alloc(0)
    }, data)

    rangeTest('test iterator with start as empty buffer - legacy', {
      start: Buffer.alloc(0)
    }, data)

    rangeTest('test iterator with lte as empty buffer', {
      lte: Buffer.alloc(0)
    }, data)

    rangeTest('test iterator with end as empty buffer - legacy', {
      end: Buffer.alloc(0)
    }, data)
  }

  rangeTest('test iterator with gte as empty string', {
    gte: ''
  }, data)

  rangeTest('test iterator with start as empty string - legacy', {
    start: ''
  }, data)

  rangeTest('test iterator with gte as null', {
    gte: null
  }, data)

  rangeTest('test iterator with start as null - legacy', {
    start: null
  }, data)

  rangeTest('test iterator with lte as empty string', {
    lte: ''
  }, data)

  rangeTest('test iterator with end as empty string - legacy', {
    end: ''
  }, data)

  rangeTest('test iterator with lte as null', {
    lte: null
  }, data)

  rangeTest('test iterator with end as null - legacy', {
    end: null
  }, data)
}

module.exports.tearDown = function (test, testCommon) {
  test('tearDown', function (t) {
    db.close(testCommon.tearDown.bind(null, t))
  })
}

module.exports.all = function (leveldown, test, testCommon) {
  var data = (function () {
    var d = []
    var i = 0
    var k
    for (; i < 100; i++) {
      k = (i < 10 ? '0' : '') + i
      d.push({
        key: k,
        value: String(Math.random())
      })
    }
    return d
  }())

  module.exports.setUp(leveldown, test, testCommon, data)
  module.exports.range(leveldown, test, testCommon, data)
  module.exports.tearDown(test, testCommon)
}
