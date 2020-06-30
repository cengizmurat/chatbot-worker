const fs = require('fs')
const express = require('express')
const axios = require('axios')
const httpsProxyAgent = require('https-proxy-agent')
const simpleGit = require('simple-git')

const logger = require('../logger')
const config = require('../../config.js')
const router = express.Router()
const agent = new httpsProxyAgent({
    host: 'proxy-mkt.int.world.socgen',
    port: 8080,
})

if (config.IAMAAS_URL !== undefined) {
    // SGitHub special endpoints
    router.put('/repos/:orgId/:repoName/import', importRepository)
}
router.post('/*', postAll)
router.get('/*', getAll)
router.put('/*', putAll)
router.delete('/*', deleteAll)

const baseUrl = config.GITHUB_URL + (config.GITHUB_URL.endsWith('/') ? '' : '/')
const githubInstance = axios.create({
    headers: { Authorization: `Bearer ${config.GITHUB_TOKEN}` },
})
const gitlabInstance = axios.create({
    headers: { Authorization: `Bearer ${config.GITLAB_TOKEN}` },
    proxy: false,
    httpsAgent: agent,
})

const repoDirectory = './imports'

async function getGroupId(groupName) {
    const parentGroupId = 984

    const getUrl = `https://apps.bsc.aws.societegenerale.com/gitlab/api/v4/groups/${parentGroupId}/subgroups?search=${groupName}`
    logger.log(`GET ${getUrl}`, 'TRACE')
    const groups = await gitlabInstance.get(getUrl)

    for (const group of groups.data) {
        if (group.name === groupName) {
            return group.id
        }
    }

    const postUrl = 'https://apps.bsc.aws.societegenerale.com/gitlab/api/v4/groups'
    const body = {
        name: groupName,
        path: groupName,
        parent_id: parentGroupId,
    }
    logger.log(`POST ${postUrl}`, 'TRACE')
    const newGroup = await gitlabInstance.post(postUrl, body)
    return newGroup.data.id
}

async function createProjectInGroup(groupId, projectName, importUrl) {
    const url = 'https://apps.bsc.aws.societegenerale.com/gitlab/api/v4/projects'
    const body = {
        namespace_id: groupId,
        name: projectName,
        import_url: importUrl,
    }

    logger.log(`POST ${url}`, 'TRACE')
    const project = await gitlabInstance.post(url, body)
    return project.data
}

async function importRepository(req, res, next) {
    try {
        const orgId = req.params['orgId']
        const repoName = req.params['repoName']
        const {destination_url, vcs_url} = req.body

        logger.log(`Importing repository "${vcs_url}" to GitLab...`, 'TRACE')

        const groupId = await getGroupId(orgId)
        const project = await createProjectInGroup(groupId, repoName, vcs_url)

        logger.log(`Importing GitLab repository to "${destination_url}"`, 'TRACE')

        const baseDirectory = `${repoDirectory}/${orgId}`
        const repoPath = `${baseDirectory}/${repoName}`
        try {
            if (fs.lstatSync(repoPath).isDirectory()) {
                fs.rmdirSync(repoPath, {recursive: true})
            }
        } catch (e) {
        } finally {
            fs.mkdirSync(baseDirectory, {recursive: true})
        }

        const git = simpleGit(baseDirectory)
        logger.log(`Cloning repository "${project.http_url_to_repo}"...`, 'TRACE')
        await git.clone(
            authenticatedUrl('x-token-auth', config.GITLAB_TOKEN, project.http_url_to_repo),
            [
                '--config',
                `http.proxy=http://proxy-mkt.int.world.socgen:8080`,
            ]
        )
        logger.log(`"${project.http_url_to_repo}" cloned`, 'TRACE')

        await git.cwd(repoPath)
        await git.removeRemote('origin')
        await git.addRemote(
            'origin',
            destination_url,
        )

        logger.log(`Pushing to repository "${destination_url}"...`, 'TRACE')
        await git.push([
            authenticatedUrl(config.GITHUB_TOKEN, '', destination_url)
        ])
        logger.log(`Pushed to repository "${destination_url}"`, 'TRACE')

        await res.json({result: 'OK'})
    } catch (e) {
        next(e)
    }
}

function authenticatedUrl(user, password, url) {
    const httpsUrl = 'https://'
    const isHttps = url.startsWith(httpsUrl)

    return `http${isHttps ? 's' : ''}://${user}${(password ? ':' : '') + password}@${url.substring(httpsUrl.length - (isHttps ? 0 : 1))}`
}

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
        logger.log(`POST ${url}`, 'TRACE')

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
        logger.log(`PUT ${url}`, 'TRACE')

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