const defaultNetworkConfig = require('../configs/default-network-config.js')
const defaultServerConfig = require('../configs/default-server-config')
const fs = require('fs')
const path = require('path')
const shell = require('shelljs')
const _ = require('lodash')
const { version } = require('../../package.json')
const util = require('./util')

module.exports = async function (networkDir, configs) {
  // Create networkDir containing network-config.json
  const networkConfig = {
    ...defaultNetworkConfig,
    ...configs,
  }
  networkConfig.serverPath = path.resolve(networkConfig.serverPath)
  networkConfig['shardus-network-version'] = version
  if (!fs.existsSync(networkDir)) {
    shell.mkdir(networkDir)
  }
  shell.cd(networkDir)
  const serverConfig = _.cloneDeep(defaultServerConfig)
  serverConfig.server.p2p.existingArchivers = JSON.parse(networkConfig.existingArchivers)
  serverConfig.server.reporting.recipient = networkConfig.monitorUrl
  if (networkConfig.autoIp) {
    serverConfig.server.ip.externalIp = 'auto'
    serverConfig.server.ip.internalIp = 'auto'
  }

  let highestExternalPort = networkConfig.highestPort || networkConfig.startingExternalPort
  let offset = highestExternalPort > networkConfig.startingExternalPort ? 1 : 0
  for (let i = 0; i < networkConfig.numberOfNodes; i++) {
    const nodeConfig = _.cloneDeep(serverConfig)
    nodeConfig.server.ip.externalPort = highestExternalPort + i + offset
    nodeConfig.server.ip.internalPort = networkConfig.startingInternalPort + i + (highestExternalPort - networkConfig.startingExternalPort) + offset
    shell.mkdir(`shardus-instance-${nodeConfig.server.ip.externalPort}`)
    console.log(`Created server instance on folder <shardus-instance-${nodeConfig.server.ip.externalPort}>`)
    shell.ShellString(JSON.stringify(nodeConfig, null, 2)).to(`shardus-instance-${nodeConfig.server.ip.externalPort}/config.json`)
    if (nodeConfig.server.ip.externalPort > networkConfig.highestPort) {
      networkConfig.highestPort = nodeConfig.server.ip.externalPort
    }
  }
  networkConfig.lowestPort = networkConfig.startingExternalPort
  networkConfig.runningPorts = networkConfig.runningPorts ? networkConfig.runningPorts : []
  shell.ShellString(JSON.stringify(networkConfig, null, 2)).to(`network-config.json`)
}
