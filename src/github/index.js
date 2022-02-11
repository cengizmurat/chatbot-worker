const express = require('express')
const axios = require('axios')

const utils = require('./utils.js')
const logger = require('../logger')
const config = require('../../config.js')
const router = express.Router()

router.post('/mirror', utils.mirrorRepository)
router.post('/*', postAll)
router.get('/*', getAll)
router.put('/*', putAll)
router.delete('/*', deleteAll)

const baseUrl = config.GITHUB_URL + ((config.GITHUB_URL || '').endsWith('/') ? '' : '/')
const githubInstance = axios.create({
    headers: { Authorization: `Bearer ${config.GITHUB_TOKEN}` },
})

async function getAll(req, res, next) {
    try {
        const url = baseUrl + req.params['0']
        logger.log(`GET ${url}`, 'TRACE')

        const response = await githubInstance.get(url)
        await res.json(response.data)
    } catch (e) {
        next(e)
    }
}

async function postAll(req, res, next) {
    try {
        const url = handleGraphQLurl(baseUrl + req.params['0'])
        const body = req.body
        logger.log(`POST ${url} ${JSON.stringify(body)}`, 'TRACE')

        const response = await githubInstance.post(url, body)
        await res.json(response.data)
    } catch (e) {
        next(e)
    }
}

async function putAll(req, res, next) {
    try {
        const url = baseUrl + req.params['0']
        const body = req.body
        logger.log(`PUT ${url} ${JSON.stringify(body)}`, 'TRACE')

        const response = await githubInstance.put(url, body)
        await res.json(response.data)
    } catch (e) {
        next(e)
    }
}

async function deleteAll(req, res, next) {
    try {
        const url = baseUrl + req.params['0']
        logger.log(`DELETE ${url}`, 'TRACE')

        const response = await githubInstance.delete(url)
        await res.json(response.data)
    } catch (e) {
        next(e)
    }
}

function handleGraphQLurl(url) {
    const regex = /https?:\/\/.+(v\d+\/)graphql$/mg

    let match
    while ((match = regex.exec(url)) !== null) {
        // This is necessary to avoid infinite loops with zero-width matches
        if (match.index === regex.lastIndex) regex.lastIndex++

        url = match.input.replace(match[1], '')
    }

    return url
}

module.exports = router