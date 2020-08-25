/* eslint-disable no-console */
'use strict'

const Libp2p = require('../../')
const TCP = require('libp2p-tcp')
const Mplex = require('libp2p-mplex')
const { NOISE } = require('libp2p-noise')
const SECIO = require('libp2p-secio')
const Gossipsub = require('libp2p-gossipsub')
const uint8ArrayFromString = require('uint8arrays/from-string')
const uint8ArrayToString = require('uint8arrays/to-string')

const createNode = async () => {
  const node = await Libp2p.create({
    addresses: {
      listen: ['/ip4/0.0.0.0/tcp/0']
    },
    modules: {
      transport: [TCP],
      streamMuxer: [Mplex],
      connEncryption: [NOISE, SECIO],
      pubsub: Gossipsub
    }
  })

  await node.start()
  return node
}

;(async () => {
  const topic = 'news'

  const [node1, node2] = await Promise.all([
    createNode(),
    createNode()
  ])

  // Add node's 2 data to the PeerStore
  node1.peerStore.addressBook.set(node2.peerId, node2.multiaddrs)
  await node1.dial(node2.peerId)

  node1.pubsub.on(topic, (msg) => {
    console.log(`node1 received: ${uint8ArrayToString(msg.data)}`)
  })
  await node1.pubsub.subscribe(topic)

  node2.pubsub.on(topic, (msg) => {
    console.log(`node2 received: ${uint8ArrayToString(msg.data)}`)
  })
  await node2.pubsub.subscribe(topic)

  // node2 publishes "news" every second
  setInterval(() => {
    node2.pubsub.publish(topic, uint8ArrayFromString('Bird bird bird, bird is the word!'))
  }, 1000)
})()
