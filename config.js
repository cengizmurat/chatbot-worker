const fs = require('fs')

const configFile = 'config.json'

let config = {}
const variables = ['OPENSHIFT_URL']
// Optional variables and their default values
const optionalVariables = {
  'PORT': '3000',
  'OPENSHIFT_TOKEN': undefined,
  'IAMAAS_URL': undefined,
  'CLIENT_ID': undefined,
  'CLIENT_SECRET': undefined,
  'SCOPE': undefined,
  'CLUSTER_NAME': undefined,
}

if (fs.existsSync(configFile)) {
  console.log(`Loading "${configFile}" file...`)
  config = require('./' + configFile)
} else {
  console.log(`"${configFile}" file not found, checking for environment variables...`)
  for (const variable of variables.concat(Object.keys(optionalVariables))) {
    const value = process.env[variable]
    if (value !== undefined) {
      config[variable] = value
    }
  }
}

for (const [optionalVariable, defaultValue] of Object.entries(optionalVariables)) {
  const definedValue = config[optionalVariable]
  if (definedValue === undefined) {
    console.log(`Optional configuration variable ${optionalVariable} not defined, using default value "${defaultValue}"`)
    config[optionalVariable] = defaultValue
  }
}

let allVariables = true
for (const variable of variables) {
  const value = config[variable]
  if (value === undefined) {
    console.error(`Configuration variable ${variable} is missing.`)
    allVariables = false
  }
}

if (!allVariables) {
  console.error('Cannot run the server due to missing configuration variable(s).')
  process.exit()
}

module.exports = config
