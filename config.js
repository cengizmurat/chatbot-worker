const fs = require('fs')

const configFile = 'config.json'

let config = {}
const variables = [
  'OPENSHIFT_URL',
  'GITLAB_URL',
  'GITLAB_TOKEN',
  'GITLAB_GROUP_ID',
  'GITLAB_SYNC_REPOSITORY_ID',
  'GITHUB_URL',
  'GITHUB_TOKEN',
  'DESTINATION_URL',
  'DESTINATION_TOKEN',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_BUCKET_PREFIX',
]
// Optional variables and their default values
const optionalVariables = {
  'PORT': '3000',
  'AWS_REGION': 'eu-west-1',
  'INSECURE_REQUESTS': 'false',
  'GITLAB_WAIT_TIMEOUT': '90',
  'GITLAB_CHECK_INTERVAL': '5',
  'OPENSHIFT_TOKEN': undefined,
  'IAMAAS_URL': undefined,
  'CLIENT_ID': undefined,
  'CLIENT_SECRET': undefined,
  'SCOPE': undefined,
  'CLUSTER_NAME': undefined,
  'LDAP_URL': undefined,
  'LDAP_BASE': undefined,
  'LDAP_DN': undefined,
  'LDAP_PASSWORD': undefined,
  'PROXY_HOST': undefined,
  'PROXY_PORT': undefined,
  'MACHINESET_SUBNET_ID': undefined,
  'MACHINESET_AMI_ID': undefined,
  'LOG': 'INFO',
}

if (fs.existsSync(configFile)) {
  console.log(`[INFO] Loading "${configFile}" file...`)
  config = require('./' + configFile)
} else {
  console.log(`[INFO] "${configFile}" file not found, checking for environment variables...`)
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
    console.log(`[INFO] Optional configuration variable ${optionalVariable} not defined, using default value "${defaultValue}"`)
    config[optionalVariable] = defaultValue
  }
}

let allVariables = true
for (const variable of variables) {
  const value = config[variable]
  if (value === undefined) {
    console.error(`[FATAL] Configuration variable ${variable} is missing.`)
    allVariables = false
  }
}

if (!allVariables) {
  console.error(`[FATAL] Cannot run the server due to missing configuration variable(s).`)
  process.exit()
}

module.exports = config
