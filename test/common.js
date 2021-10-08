'use strict'

const kNone = Symbol('none')
const kProtected = Symbol('protected')

function testCommon (options) {
  const factory = options.factory
  const test = options.test

  if (typeof factory !== 'function') {
    throw new TypeError('factory must be a function')
  }

  if (typeof test !== 'function') {
    throw new TypeError('test must be a function')
  }

  if (options.legacyRange != null) {
    throw new Error('The legacyRange option has been removed')
  }

  let supports = kNone

  return protect(options, {
    test: test,
    factory: factory,

    // Expose manifest through testCommon to more easily skip tests based on
    // supported features. Use a getter to only create a db once. Implicitly
    // we also test that the manifest doesn't change after the db constructor.
    get supports () {
      if (supports === kNone) this.supports = this.factory().supports
      return supports
    },

    // Prefer assigning early via manifest-test unless test.only() is used
    // in which case we create the manifest on-demand. Copy it to be safe.
    set supports (value) {
      if (supports === kNone) supports = JSON.parse(JSON.stringify(value))
    }
  })
}

module.exports = testCommon

// Throw if test suite options are used instead of db.supports
function protect (options, testCommon) {
  const legacyOptions = [
    'bufferKeys',
    'createIfMissing',
    'errorIfExists',
    'snapshots',
    'seek',
    'serialize',
    'encodings',
    'deferredOpen',
    'streams',
    'clear',
    'getMany'
  ]

  Object.defineProperty(testCommon, kProtected, {
    value: true
  })

  for (const k of legacyOptions) {
    // Options may be a testCommon instance
    if (!options[kProtected] && k in options) {
      throw new Error(`The test suite option '${k}' has moved to db.supports`)
    }

    Object.defineProperty(testCommon, k, {
      get () {
        throw new Error(`The test suite option '${k}' has moved to db.supports`)
      },
      set () {
        throw new Error(`The test suite option '${k}' has moved to db.supports`)
      }
    })
  }

  return testCommon
}
