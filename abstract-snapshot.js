'use strict'

const ModuleError = require('module-error')
const { noop } = require('./lib/common')

class AbstractSnapshot {
  #open = true
  #referenceCount = 0
  #pendingClose = null
  #closePromise = null
  #owner

  constructor (options) {
    // Defining this as an option gives sublevels the opportunity to create a snapshot
    // via their parent database but still designate themselves as the "owner", which
    // just means which database will close the snapshot upon db.close(). This ensures
    // that the API of AbstractSublevel is symmetrical to AbstractLevel.
    const owner = options.owner

    if (typeof owner !== 'object' || owner === null) {
      const hint = owner === null ? 'null' : typeof owner
      throw new TypeError(`Owner must be an abstract-level database, received ${hint}`)
    }

    // Also ensures this db will not be garbage collected
    this.#owner = owner
    this.#owner.attachResource(this)
  }

  ref () {
    if (!this.#open) {
      throw new ModuleError('Snapshot is not open: cannot use snapshot after close()', {
        code: 'LEVEL_SNAPSHOT_NOT_OPEN'
      })
    }

    this.#referenceCount++
  }

  unref () {
    if (--this.#referenceCount === 0) {
      this.#pendingClose?.()
    }
  }

  async close () {
    if (this.#closePromise !== null) {
      // First caller of close() is responsible for error
      return this.#closePromise.catch(noop)
    }

    this.#open = false

    // Wrap to avoid race issues on recursive calls
    this.#closePromise = new Promise((resolve, reject) => {
      this.#pendingClose = () => {
        this.#pendingClose = null
        privateClose(this, this.#owner).then(resolve, reject)
      }
    })

    // If working we'll delay closing, but still handle the close error (if any) here
    if (this.#referenceCount === 0) {
      this.#pendingClose()
    }

    return this.#closePromise
  }

  async _close () {}
}

if (typeof Symbol.asyncDispose === 'symbol') {
  AbstractSnapshot.prototype[Symbol.asyncDispose] = async function () {
    return this.close()
  }
}

const privateClose = async function (snapshot, owner) {
  await snapshot._close()
  owner.detachResource(snapshot)
}

exports.AbstractSnapshot = AbstractSnapshot
