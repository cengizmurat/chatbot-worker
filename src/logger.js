const config = require('../config.js')

const traceLevel = 'TRACE'
const infoLevel = 'INFO'
const errorLevel = 'ERROR'
const fatalLevel = 'FATAL'
const logLevels = [traceLevel, infoLevel, errorLevel, fatalLevel]
config.LOG = logLevels.indexOf(config.LOG) > -1 ? config.LOG : infoLevel
const logLevel = logLevels.indexOf(config.LOG)
const error = logLevels.indexOf(errorLevel)

function log(message, level = infoLevel) {
    const intLevel = logLevels.indexOf(level)
    if (intLevel >= logLevel) {
        if (Array.isArray(message)) {
            message = message.map(m => typeof m === 'string' || m instanceof String ? m : JSON.stringify(m))
            message = message.join('\n')
        }
        if (message.toJSON !== undefined) {
            message = message.toJSON()
        }
        if (!(typeof message === 'string' || message instanceof String)) {
            message = JSON.stringify(message)
        }
        message = `[${level}] ${message}`

        level >= error ? console.error(message) : console.log(message)
    }
}

module.exports = {
    log,
}