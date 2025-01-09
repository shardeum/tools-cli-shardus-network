const shell = require('shelljs')
const fs = require('fs')
const path = require('path')
const util = require('./util')
const archiverKeys = require('../configs/archiver-config')

module.exports = async function (networkDir, num, type, pm2Args, options) {
  shell.cd(networkDir)
  const instancesPath = path.join(process.cwd())
  const configPath = path.join(instancesPath, 'network-config.json')
  const networkConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'))

  // Pass PM2 parameters to not restart a node if it exits with an error code
  if (pm2Args.includes('pm2--count-exit-errors') === false) {
    pm2Args.push('pm2--count-exit-errors')
  }
  if (pm2Args.includes('pm2--max-restarts') === false || pm2Args.includes('pm2--max-restarts=1') === false) {
    pm2Args.push('pm2--max-restarts=1')
  }

  const instances = shell.ls('-d', `${instancesPath}/shardus-instance*`)
  let nodesToStart = num ? num : instances.length

  try {
    if (options.archivers) {
      const existingArchivers = JSON.parse(networkConfig.existingArchivers)
      let newArchiverCount = parseInt(options.archivers)
      if (newArchiverCount > 9) newArchiverCount = 9

      const existingArchiversEnv = existingArchivers.map((archiver) => `${archiver.ip}:${archiver.port}:${archiver.publicKey}`).join(',')
      // Start new archivers on ports following existingArchivers
      for (let i = 0; i < newArchiverCount; i++) {
        await util.pm2Start(
          networkDir,
          require.resolve('@shardeum-foundation/archiver', { paths: [process.cwd()] }),
          `archive-server-${i + 1 + existingArchivers.length}`,
          {
            ARCHIVER_PORT: existingArchivers[0].port + existingArchivers.length + i,
            ARCHIVER_PUBLIC_KEY: archiverKeys[existingArchivers.length + i].publicKey,
            ARCHIVER_SECRET_KEY: archiverKeys[existingArchivers.length + i].secretKey,
            ARCHIVER_INFO: existingArchiversEnv,
            ARCHIVER_DB: `archiver-db-${archiverKeys[existingArchivers.length + i].port}`
          },
          pm2Args
        )
      }

      // Add the newly started archivers to network-config.json existingArchivers
      for (let i = 1; i <= newArchiverCount; i++) {
        existingArchivers.push({ ip: existingArchivers[0].ip, port: existingArchivers[0].port + existingArchivers.length, publicKey: archiverKeys[existingArchivers.length].publicKey })
      }
      networkConfig.existingArchivers = JSON.stringify(existingArchivers)
      shell.ShellString(JSON.stringify(networkConfig, null, 2)).to(`network-config.json`)

      return
    }

    // Start archiver
    if (networkConfig.startArchiver) {
      const existingArchivers = JSON.parse(networkConfig.existingArchivers)

      await util.pm2Start(
        networkDir,
        require.resolve('@shardeum-foundation/archiver', { paths: [process.cwd()] }),
        `archive-server-1`,
        {
          ARCHIVER_PORT: existingArchivers[0].port,
          ARCHIVER_PUBLIC_KEY: archiverKeys[0].publicKey,
          ARCHIVER_SECRET_KEY: archiverKeys[0].secretKey,
          ARCHIVER_INFO: '',
          ARCHIVER_DB: `archiver-db-${archiverKeys[0].port}`
        },
        pm2Args
      )

      networkConfig.startArchiver = false // Prevent this code from running twice

      await util.sleep(1000) // Add 1sec delay to allow archiver to be ready, so that monitor can connect it with archiver discovery
    }

    // Start monitor
    if (networkConfig.startMonitor) {
      let existingArchivers = JSON.parse(networkConfig.existingArchivers)
      const existingArchiversEnv = existingArchivers.map((archiver) => `${archiver.ip}:${archiver.port}:${archiver.publicKey}`).join(',')
      await util.pm2Start(
        networkDir,
        require.resolve("@shardeum-foundation/monitor-server", { paths: [process.cwd()] }),
        "monitor-server",
        {
          PORT: new URL(networkConfig.monitorUrl).port,
          ARCHIVER_INFO: existingArchiversEnv,
          NODE_ENV: "debug",
          NAME: "admin",
          PASSWORD: "password",
        },
        pm2Args
      );
      networkConfig.startMonitor = false; // Prevent this code from running twice
    }

    // Start explorer
    if (networkConfig.startExplorerServer) {
      await util.pm2Start(
        networkDir,
        require.resolve('explorer-server', { paths: [process.cwd()] }),
        'explorer-server',
        { PORT: networkConfig.explorerServerPort },
        pm2Args
      )
      networkConfig.startExplorerServer = false // Prevent this code from running twice
    }
    // if (networkConfig.startExplorerClient) {
    //   await util.pm2Start(networkDir, require.resolve('explorer-client', { paths: [process.cwd()] }), 'explorer-client', { PORT: networkConfig.explorerClientPort }, pm2Args)
    //   networkConfig.startExplorerClient = false
    // }
  } catch (err) {
    console.log(err)
  }

  if (type === 'create') {
    for (let i = 0; i < nodesToStart; i++) {
      if (!networkConfig.runningPorts.includes(networkConfig.lowestPort + i)) {
        if (instances[i]) {
          if (options?.inspect) {
            await util.pm2Start(networkDir, networkConfig.serverPath, path.basename(instances[i]), { BASE_DIR: instances[i] }, [`pm2--node-args="--inspect=127.0.0.1:${networkConfig.inspectPort + i}"`, ...pm2Args])
          } else {
            await util.pm2Start(networkDir, networkConfig.serverPath, path.basename(instances[i]), { BASE_DIR: instances[i] }, pm2Args)
          }
          networkConfig.runningPorts.push(networkConfig.lowestPort + i)
        }
      } else {
        nodesToStart++
      }
    }
  }

  if (type === 'start') {
    for (let i = instances.length - num; i < instances.length; i++) {
      if (options?.inspect) {
        await util.pm2Start(networkDir, networkConfig.serverPath, path.basename(instances[i]), { BASE_DIR: instances[i] }, [`pm2--node-args="--inspect=127.0.0.1:${networkConfig.inspectPort + i}"`, ...pm2Args])
      } else {
        await util.pm2Start(networkDir, networkConfig.serverPath, path.basename(instances[i]), { BASE_DIR: instances[i] }, pm2Args)
      }
      let port = parseInt(instances[i].split('-').pop())
      networkConfig.runningPorts.push(port)
    }
  }

  shell.ShellString(JSON.stringify(networkConfig, null, 2)).to(`network-config.json`)

  console.log()
  console.log('\x1b[33m%s\x1b[0m', 'View network monitor at:') // Yellow
  console.log('  http://localhost:\x1b[32m%s\x1b[0m', new URL(networkConfig.monitorUrl).port) // Green
  console.log()
}
