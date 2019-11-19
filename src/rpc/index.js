'use strict'

const pull = require('pull-stream')
const lp = require('pull-length-prefixed')

const Message = require('../message')
const handlers = require('./handlers')
const utils = require('../utils')
const c = require('../constants')

module.exports = (dht) => {
  const log = utils.logger(dht.peerInfo.id, 'rpc')
  const getMessageHandler = handlers(dht)

  /**
   * Process incoming DHT messages.
   *
   * @param {PeerInfo} peer
   * @param {Message} msg
   * @returns {Promise<Message>}
   *
   * @private
   */
  async function handleMessage (peer, msg) {
    try {
      await dht._add(peer)
    } catch (err) {
      log.error('Failed to update the kbucket store')
      log.error(err)
    }

    // get handler & exectue it
    const handler = getMessageHandler(msg.type)

    if (!handler) {
      log.error(`no handler found for message type: ${msg.type}`)
      return
    }

    return handler(peer, msg)
  }

  /**
   * Handle incoming streams from the Switch, on the dht protocol.
   *
   * @param {string} protocol
   * @param {Connection} conn
   * @returns {void}
   */
  return function protocolHandler (protocol, conn) {
    conn.getPeerInfo((err, peer) => {
      if (err) {
        log.error('Failed to get peer info')
        log.error(err)
        return
      }

      log('from: %s', peer.id.toB58String())

      pull(
        conn,
        lp.decode(),
        pull.filter((msg) => msg.length < c.maxMessageSize),
        pull.map((rawMsg) => {
          let msg
          try {
            msg = Message.deserialize(rawMsg)
          } catch (err) {
            log.error('failed to read incoming message', err)
            return
          }

          return msg
        }),
        pull.filter(Boolean),
        pull.asyncMap(async (msg, cb) => {
          let response
          try {
            response = await handleMessage(peer, msg)
          } catch (err) {
            cb(err)
          }
          cb(null, response)
        }),
        // Not all handlers will return a response
        pull.filter(Boolean),
        pull.map((response) => {
          let msg
          try {
            msg = response.serialize()
          } catch (err) {
            log.error('failed to send message', err)
            return
          }
          return msg
        }),
        pull.filter(Boolean),
        lp.encode(),
        conn
      )
    })
  }
}
