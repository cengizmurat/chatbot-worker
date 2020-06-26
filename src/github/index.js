const fs = require('fs')
const express = require('express')
const axios = require('axios')
const git = require('nodegit')

const logger = require('../logger')
const config = require('../../config.js')
const router = express.Router()

router.post('/repos/:orgId/:repoName/import', importRepository)
router.post('/*', postAll)
router.get('/*', getAll)
router.put('/*', putAll)
router.delete('/*', deleteAll)

const baseUrl = config.GITHUB_URL + (config.GITHUB_URL.endsWith('/') ? '' : '/')
const axiosConfig = {
    headers: { Authorization: `Bearer ${config.GITHUB_TOKEN}` },
}
const axiosInstance = axios.create(axiosConfig)

const repoDirectory = './imports'

async function importRepository(req, res, next) {
    try {
        const orgId = req.params['orgId']
        const repoName = req.params['repoName']
        const {destination_url, vcs_url} = req.body

        const repoPath = `${repoDirectory}/${orgId}/${repoName}`
        try {
            if (fs.lstatSync(repoPath).isDirectory()) {
                fs.rmdirSync(repoPath, {recursive: true})
            }
        } catch (e) {
        }

        const repo = await git.Clone(vcs_url, repoPath)
        await git.Remote.setPushurl(repo, 'origin', destination_url)

        const remote = await repo.getRemote('origin')
        const refs = await repo.getReferences()
        const refSpecs = refs.map(ref => `${ref.toString()}:${ref.toString()}`)

        await remote.push(refSpecs, {
            callbacks: {
                credentials: gitCredentials,
            }
        })

        await res.json({result: 'OK'})
    } catch (e) {
        next(e)
    }
}

function gitCredentials(url, user) {
    return git.Cred.userpassPlaintextNew(config.GITHUB_TOKEN, 'x-oauth-basic')
}

async function getAll(req, res, next) {
    try {
        const url = baseUrl + req.params['0']
        logger.log(`GET ${url}`, 'TRACE')

        const response = await axiosInstance.get(url)
        await res.json(response.data)
    } catch (e) {
        next(e)
    }
}

async function postAll(req, res, next) {
    try {
        const url = handleGraphQLurl(baseUrl + req.params['0'])
        const body = req.body
        logger.log(`POST ${url}`, 'TRACE')

        const response = await axiosInstance.post(url, body)
        await res.json(response.data)
    } catch (e) {
        next(e)
    }
}

async function putAll(req, res, next) {
    try {
        const url = baseUrl + req.params['0']
        const body = req.body
        logger.log(`PUT ${url}`, 'TRACE')

        const response = await axiosInstance.put(url, body)
        await res.json(response.data)
    } catch (e) {
        next(e)
    }
}

async function deleteAll(req, res, next) {
    try {
        const url = baseUrl + req.params['0']
        logger.log(`DELETE ${url}`, 'TRACE')

        const response = await axiosInstance.delete(url)
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