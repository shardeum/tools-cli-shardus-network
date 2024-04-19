const { create } = require('../lib')
const inquirer = require('inquirer')
const fs = require('fs')
const defaultNetwork = require('../configs/default-network-config')
const path = require('path')
const { start } = require('../lib')
const util = require('../lib/util')

// Try to get serverPath from `main` field of package.json, otherwise use default
let serverPath
try {
  const packageJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), './package.json')))
  serverPath = packageJson.main
} catch (err) {
  serverPath = defaultNetwork.serverPath
}

const notNull = (input, answers) => {
  if (input === '') return 'Value cannot be empty'
  else return true
}

const isNumber = (input, answers) => {
  if (isNaN(input)) return 'Value must be a number'
  else return true
}

const getQuestions = (options) => {
  const questions = [
    {
      name: 'serverPath',
      default: serverPath,
      message: 'Choose the main server file path',
      validate: (input, answers) => {
        if (input === '') return `Server file path cannot be null`
        if (!fs.existsSync(path.resolve(input))) return `Cannot find ${path.resolve(input)}`
        else return true
      },
    },
    {
      default: defaultNetwork.instancesPath,
      name: 'instancesPath',
      message: 'What name should be the folder to be created for the network instances ?',
      // transformer: input =>  path.resolve(input),
      validate: (input, answers) => {
        if (input === '') return `Cannot create a directory without a name`
        if (fs.existsSync(path.resolve(input))) return `Cannot create directory ${input}, already exists`
        else return true
      },
    },
    {
      // Number Of nodes
      default: defaultNetwork.numberOfNodes,
      type: 'number',
      name: 'numberOfNodes',
      message: 'How many nodes do you want to create ?',
      validate: isNumber,
    },
    {
      // Starting external port
      default: defaultNetwork.startingExternalPort,
      type: 'number',
      name: 'startingExternalPort',
      message: 'Whats the starting external port ? (the nodes will be created from starting external port to starting external port + number of nodes',
      validate: isNumber,
    },
    {
      // Starting internal port
      default: defaultNetwork.startingInternalPort,
      type: 'number',
      name: 'startingInternalPort',
      message: 'Whats the starting internal port ? (the nodes will be created from starting internal port to starting internal port + number of nodes',
      validate: (input, answers) => {
        if (isNaN(input)) return 'Value must be a number'
        const extPort = answers['startingExternalPort']
        const num = answers['numberOfNodes']
        if ((input <= extPort) & (input + num > extPort) || (input >= extPort) & (extPort + num > input)) {
          return `External port value will overlap internal port, please select a value <= ${extPort - num} or >= ${extPort + num}`
        } else return true
      },
    },
    {
      // Whether or not to start an archiver locally
      default: defaultNetwork.startArchiver,
      name: 'startArchiver',
      type: 'confirm',
      message: 'Do you want to run an archiver instance locally ?',
      validate: notNull,
    },
    {
      // If starting an archiver locally, ask which port it'll run on
      when: (answers) => answers.startArchiver,
      default: JSON.parse(defaultNetwork.existingArchivers)[0].port,
      name: 'existingArchivers',
      message: 'Which port do you want to run the archiver instance on?',
      validate: notNull,
      filter: (input, answers) => {
        const archiversArray = JSON.parse(defaultNetwork.existingArchivers)
        archiversArray[0].port = Number(input)
        return JSON.stringify(archiversArray)
      }
    },
    {
      // If not running an archiver locally, ask for a list of archivers in JSON format
      when: (answers) => !answers.startArchiver,
      default: JSON.stringify(JSON.parse(defaultNetwork.existingArchivers)),
      name: 'existingArchivers',
      message: "Enter a JSON formatted list of archivers",
      validate: (input, answers) => {
        try {
          JSON.parse(input)
          return true
        } catch (error) {
          return `Invalid JSON: ${error.message}`
        }
      }
    },
    {
      // Whether or not to start a monitor instance locally
      default: defaultNetwork.startMonitor,
      name: 'startMonitor',
      type: 'confirm',
      message: 'Do you want to run a monitor instance locally ?',
      validate: notNull,
    },
    {
      // If starting a monitor locally, ask which port to start it on
      when: (answers) => answers.startMonitor,
      default: new URL(defaultNetwork.monitorUrl).port,
      name: 'monitorUrl',
      message: 'Which port do you want to run the monitor on ?',
      validate: notNull,
      filter: (input, answers) => {
        const monitorUrl = new URL(defaultNetwork.monitorUrl)
        monitorUrl.port = input
        return monitorUrl.toString()
      }
    },
    // If not starting a monitor locally, ask what the url of its API is
    {
      when: (answers) => !answers.startMonitor,
      default: defaultNetwork.monitorUrl,
      name: 'monitorUrl',
      message: "Enter a monitor's API URL",
      validate: (input, answers) => {
        try {
          new URL(input)
          return true
        } catch (error) {
          return `Invalid URL`
        }
      }
    },
    // {
    //   // Whether starts or not the explorer server locally
    //   default: defaultNetwork.startExplorerServer,
    //   name: 'startExplorerServer',
    //   type: 'confirm',
    //   message: 'Do you want to run an explorer-server instance locally ?',
    //   validate: notNull,
    // },
    // {
    //   // If yes, just ask in which port it'll run
    //   when: (answers) => answers.startExplorerServer === true,
    //   default: defaultNetwork.explorerServerPort,
    //   name: 'explorerServerPort',
    //   message: 'Which port do you want to run the explorer-server ?',
    //   validate: isNumber,
    // },
    // {
    //   when: (answers) => !answers.startExplorerServer === true,
    //   default: defaultNetwork.explorerServerAddr,
    //   name: 'explorerServerAddr',
    //   message: "What's the explorer-server address ?",
    //   validate: notNull,
    // },
    // {
    //   default: defaultNetwork.explorerServerPort,
    //   name: 'explorerServerPort',
    //   message: "What's the explorer-server port ?",
    //   validate: isNumber,
    //   when: (answers) => !answers.startExplorerServer,
    // },
    {
      default: defaultNetwork.logSize,
      name: 'logSize',
      message: "What's the max size of each log file in MB ?",
      validate: isNumber,
      when: (answers) => !answers.logSize && !options['noLogRotation'],
    },
    {
      default: defaultNetwork.logNum,
      name: 'logNum',
      message: "Number of old log files to keep before deleting",
      validate: isNumber,
      when: (answers) => !answers.logNum && !options['noLogRotation'],
    },
    // { // Whether starts or not the explorer client locally
    //   default: defaultNetwork.startExplorerClient,
    //   name: 'startExplorerClient',
    //   type: 'confirm',
    //   message: 'Do you want to run a explorer client instance locally ?',
    //   validate: notNull
    // },
    // {
    //   default: defaultNetwork.explorerClientAddr,
    //   name: 'explorerClientAddr',
    //   message: 'What\'s the explorer-client address ?',
    //   validate: notNull,
    //   when: (answers) => !answers.startExplorerClient
    // },
    // {
    //   default: defaultNetwork.explorerClientPort,
    //   name: 'explorerClientPort',
    //   message: 'What\'s the explorer-client port ?',
    //   validate: isNumber,
    //   when: (answers) => !answers.startExplorerClient
    // }
  ]
  return questions
}

module.exports = async function (args, options, logger) {
  const networkDir = options.dir ? path.join(process.cwd(), options.dir) : path.join(process.cwd(), 'instances')
  const num = parseInt(args.num)
  const startingExternalPort = options.startingExternalPort
    ? parseInt(options.startingExternalPort)
    : defaultNetwork.startingExternalPort;
  const startingInternalPort = options.startingInternalPort 
    ? parseInt(options.startingInternalPort) 
    : defaultNetwork.startingInternalPort;

  // If an instances network directory exists, run create on it
  if (util.checkNetworkFolder(networkDir, true)) {
    const configPath = path.join(networkDir, 'network-config.json')
    const networkConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    networkConfig.numberOfNodes = num ? num : 10

    await create(networkDir, networkConfig, num, args.pm2)

    if (!options['noLogRotation']) {
      await util.pm2InstallRotateLog(networkDir)
      await util.pm2SetRotateLog(networkDir)
    }
    if (options['noStart'] === false) {
      start(networkDir, num, 'start', args.pm2)
    }
  }
  // If an arg for num of nodes is given, start a network w/default configs
  else if (args.num) {
    // Use the default configuration
    const config = {
      serverPath: serverPath,
      instancesPath: networkDir,
      numberOfNodes: num,
      startingExternalPort: startingExternalPort,
      startingInternalPort: startingInternalPort,
      archivers: defaultNetwork.archivers,
      existingArchivers: options.existingArchivers ? options.existingArchivers : defaultNetwork.existingArchivers,
      startArchiver: options.existingArchivers ? false : defaultNetwork.startArchiver,
      monitorUrl: options.monitorUrl ? options.monitorUrl : defaultNetwork.monitorUrl,
      startMonitor: options.monitorUrl ? false : defaultNetwork.startMonitor,
      // If we were given an archivers list and/or a monitor url, don't start an explorer
      startExplorerServer: (options.existingArchivers || options.monitorUrl) ? false : defaultNetwork.startExplorerServer,
      explorerServerPort: defaultNetwork.explorerServerPort,
      logSize: (options.logSizeMb) ? options.logSizeMb : defaultNetwork.logSize,
      logNum: (options.logNum) ? options.logNum : defaultNetwork.logNum
    }

    if (options['autoIp']) config.autoIp = true

    await create(networkDir, config)

    if (!options['noLogRotation']) {
      await util.pm2InstallRotateLog(networkDir)
      await util.pm2SetRotateLog(networkDir, options.logSizeMb, options.logSize)
    }
    if (options['noStart'] === false) {
      start(networkDir, num, 'create', args.pm2, options)
    }
  }
  // Otherwise, use a questionnaire to get configs
  else {
    const questions = getQuestions(options)
    inquirer.prompt(questions).then(async (answers) => {
      await create(networkDir, answers)
      if (!options['noLogRotation']) {
        await util.pm2InstallRotateLog(networkDir)
        await util.pm2SetRotateLog(networkDir, answers.logSize, answers.logNum)
      }
      if (options['noStart'] === false) {
        start(networkDir, num, 'create', args.pm2, options)
      }
    })
  }
}
