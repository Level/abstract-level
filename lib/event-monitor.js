'use strict'

const { deprecate } = require('./common')

exports.EventMonitor = class EventMonitor {
  constructor (emitter, events) {
    for (const event of events) {
      // Track whether listeners are present
      this[event.name] = false

      // Prepare deprecation message
      if (event.deprecated) {
        event.message = `The '${event.name}' event is deprecated in favor of '${event.alt}' and will be removed in a future version of abstract-level`
      }
    }

    const map = new Map(events.map(e => [e.name, e]))
    const monitor = this

    emitter.on('newListener', beforeAdded)
    emitter.on('removeListener', afterRemoved)

    function beforeAdded (name) {
      const event = map.get(name)

      if (event !== undefined) {
        monitor[name] = true

        if (event.deprecated) {
          deprecate(event.message)
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
