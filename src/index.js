const express = require('express')
const bodyParser = require('body-parser')

const config = require('../config.js')

const app = express()

app.use(bodyParser.json())
app.use(bodyParser.urlencoded({
    extended: true
}))

async function init() {
    app.use(cors)
    app.use(preprocessRequest)
    app.use(logRequest)
    app.use('/', router)
    app.use(handleError)

    return app
}

const router = express.Router()
router.get('/', homeUrl)

if (config.OPENSHIFT_TOKEN !== undefined) {
    router.use('/openshift', require('./openshift'))
} else if (config.IAMAAS_URL !== undefined) {
    router.use('/openshift', require('./oseaas'))
}

async function homeUrl(req, res, next) {
    res.statusCode = 200
    await res.json({Status: 'Up'})
}

async function cors(req, res, next) {
    res.header('Access-Control-Allow-Origin', '*')
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept')
    next()
}

function preprocessRequest(req, res, next) {
    const entries = Object.entries(req.body)
    if (entries.length > 0 && entries[0][1] === '') {
        req.body = JSON.parse(entries[0][0])
    }
    next()
}

function logRequest(req, res, next) {
    logRequestParams(req)
    logResponseBody(req, res)

    next()
}

function logRequestParams(req) {
    console.log('Request')
    console.log({
        headers: req.headers,
        url: req.url,
        method: req.method,
        params: req.params,
        query: req.query,
        body: req.body,
    })
}

function logResponseBody(req, res) {
    const oldWrite = res.write,
        oldEnd = res.end

    const chunks = []

    res.write = function (chunk) {
        chunks.push(chunk)

        oldWrite.apply(res, arguments)
    }

    res.end = function (chunk) {
        if (chunk)
            chunks.push(chunk)

        const body = Buffer.concat(chunks).toString('utf8')
        console.log(`Response ${req.originalUrl}`)
        console.log(body)

        oldEnd.apply(res, arguments)
    }
}

async function handleError(err, req, res, next) {
    console.error(err)
    const response = err.response
    if (response && response.data) {
        res.status(response.data.code || err.status || 500)
        await res.json(response.data)
    } else {
        res.status(500)
        await res.json({reason: err.message})
    }
}

exports.init = init
