'use strict'

const { deprecate } = require('./common')

exports.EventMonitor = class EventMonitor {
  constructor (emitter, events) {
    for (const event of events) {
      // Track whether listeners are present
      this[event.name] = false
    }

    const map = new Map(events.map(e => [e.name, e]))
    const monitor = this

    emitter.on('newListener', beforeAdded)
    emitter.on('removeListener', afterRemoved)

    function beforeAdded (name) {
      const event = map.get(name)

      if (event !== undefined) {
        monitor[name] = true

        if (name === 'put' || name === 'del' || name === 'batch') {
          deprecate(`The '${name}' event has been removed in favor of 'write'`)
        }
      }
    }

    function afterRemoved (name) {
      if (map.has(name)) {
        monitor[name] = this.listenerCount(name) > 0
      }
    }
  }
}
