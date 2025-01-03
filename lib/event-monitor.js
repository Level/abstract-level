'use strict'

const { deprecate } = require('./common')

exports.EventMonitor = class EventMonitor {
  constructor (emitter) {
    // Track whether listeners are present, because checking
    // a boolean is faster than checking listenerCount().
    this.write = false

    const beforeAdded = (name) => {
      if (name === 'write') {
        this.write = true
      }

      if (name === 'put' || name === 'del' || name === 'batch') {
        deprecate(`The '${name}' event has been removed in favor of 'write'`)
      }
    }

    const afterRemoved = (name) => {
      if (name === 'write') {
        this.write = emitter.listenerCount('write') > 0
      }
    }

    emitter.on('newListener', beforeAdded)
    emitter.on('removeListener', afterRemoved)
  }
}
