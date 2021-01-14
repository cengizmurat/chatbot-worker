const axios = require('axios')

const logger = require('../logger')
const config = require('../../config.js')

const gitlabTimeout = parseInt(config.GITLAB_WAIT_TIMEOUT)
const gitlabCheckInterval = parseInt(config.GITLAB_CHECK_INTERVAL)
const gitlabImportsGroupId = config.GITLAB_GROUP_ID
const syncRepositoryId = config.GITLAB_SYNC_REPOSITORY_ID
const repositoriesFilePath = 'data/repositories.json'
const exportUrlBase = generateMirrorUrl(config.DESTINATION_URL, config.DESTINATION_TOKEN)

const gitlabInstance = axios.create({
    baseURL: config.GITLAB_URL,
    headers: { Authorization: `Bearer ${config.GITLAB_TOKEN}` },
    proxy: false,
})

function generateMirrorUrl(url, token) {
    const protocolString = '://'
    const protocolIndex = url.indexOf(protocolString) + protocolString.length
    return url.substring(0, protocolIndex) + token + '@' + url.substring(protocolIndex)
}

function decodeUrl(str) {
    str = str.replace(/#x([0-9A-Fa-f]{2});/g, function() {
        return String.fromCharCode(parseInt(arguments[1], 16));
    });
    return str.replace(/&amp;/g, '')
}

async function mirrorRepository(req, res, next) {
    try {
        const {
            isPrivate,
            owner,
            name,
            url,
        } = req.body

        let project = await createEmptyProject(name, owner)

        const newData = {
            private: isPrivate.toString() === 'true',
            owner,
            source: name,
        }
        const response = await appendToDataFile(newData, repositoriesFilePath)

        logger.log('Waiting for destination server to respond...')
        const success = await waitForDestination()
        if (!success) {
            res.statusCode = 503
            return await res.json({
                message: 'Waited too long for destination server',
            })
        }
        logger.log('Destination server OK')

        const exportUrl = `${exportUrlBase}/${owner}/${name}.git`
        await configurePushMirror(project, exportUrl)
        await configurePullMirror(project, decodeUrl(url))

        await res.json(response.data)
    } catch (e) {
        console.error(e)
        next(e)
    }
}

async function createEmptyProject(name, owner) {
    const subgroup = await getOrCreateSubgroup(owner)

    logger.log(`Creating project "${name}"...`)
    const project = await gitlabInstance.post('/projects', {
        path: name,
        namespace_id: subgroup.id,
    })
    logger.log(`Project "${name}" created`)

    return project.data
}

async function getOrCreateSubgroup(name) {
    const groups = await gitlabInstance.get(`/groups/${gitlabImportsGroupId}/subgroups?search=${name}`)
    const subGroups = groups.data.filter(group => group.path === name)

    const subGroup = subGroups[0]
    if (subGroup) return subGroup

    const body = {
        name: name,
        path: name,
        parent_id: gitlabImportsGroupId,
    }
    logger.log(`Creating subgroup "${name}"...`)
    const response = await gitlabInstance.post(`/groups`, body)
    logger.log(`Subgroup "${name}" created`)

    return response.data
}

async function appendToDataFile(data, filePath, branch = 'master') {
    const fileUrl = `/projects/${syncRepositoryId}/repository/files/${encodeURIComponent(filePath)}`
    const arrayData = await getDataFile(fileUrl, branch)
    arrayData.push(data)

    logger.log(`Updating data file "${filePath}"...`)
    const response = await gitlabInstance.put(`${fileUrl}`, {
        branch: branch,
        commit_message: "Automatic update from GitLab",
        content: JSON.stringify(arrayData, null, 2),
    })
    logger.log(`Data file "${filePath}" updated`)

    return response.data
}

async function getDataFile(fileUrl, branch = 'master') {
    const response = await gitlabInstance.get(`${fileUrl}/raw?ref=${branch}`)
    return response.data
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForDestination() {
    const fileUrl = `/projects/${syncRepositoryId}/repository/files/${encodeURIComponent(repositoriesFilePath)}`
    const now = new Date()
    let data = await getDataFile(fileUrl)
    while (data.filter(object => object.destination === undefined).length > 0) {
        await sleep(gitlabCheckInterval * 1000)
        data = await getDataFile(fileUrl)
        const diffSeconds = (new Date() - now) / 1000
        if (diffSeconds > gitlabTimeout) {
            return false
        }
    }

    return true
}

async function configurePushMirror(project, exportUrl) {
    const url = `/projects/${project.id}/remote_mirrors`
    const body = {
        url: exportUrl,
        keep_divergent_refs: true,
        only_protected_branches: false,
        enabled: true,
    }
    logger.log(`Configuring push mirroring for project "${project.path_with_namespace}"...`)
    const response = await gitlabInstance.post(url, body)
    logger.log(`Push mirroring for project "${project.path_with_namespace}" configured`)
    return response.data
}

async function configurePullMirror(project, importUrl) {
    const url = `/projects/${project.id}`
    const body = {
        import_url: importUrl,
        mirror: true,
        only_mirror_protected_branches: false
    }
    logger.log(`Configuring pull mirroring for project "${project.path_with_namespace}"...`)
    const response = await gitlabInstance.put(url, body)
    logger.log(`Pull mirroring for project "${project.path_with_namespace}" configured`)
    return response.data
}

module.exports = {
    mirrorRepository,
}