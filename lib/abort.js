'use strict'

// Requires Node.js >= 15
const src = typeof globalThis.AbortController !== 'undefined'
  ? globalThis
  : require('./abort-ponyfill')

exports.AbortController = src.AbortController
exports.AbortSignal = src.AbortSignal
