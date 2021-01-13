const axios = require('axios')
const httpsProxyAgent = require('https-proxy-agent')

const logger = require('../logger')
const config = require('../../config.js')

const agent = new httpsProxyAgent({
    host: config.PROXY_HOST,
    port: config.PROXY_PORT,
})

const gitlabInstance = axios.create({
    baseURL: config.GITLAB_URL,
    headers: { Authorization: `Bearer ${config.GITLAB_TOKEN}` },
    proxy: false,
    //httpsAgent: agent,
})

const gitlabImportsGroupId = 984
const syncRepositoryId = 2220
const repositoriesFilePath = 'data/repositories.json'

async function mirrorRepository(req, res, next) {
    const {
        isPrivate,
        owner,
        name,
        url,
    } = req.body

    const project = await createEmptyProject(name, owner)

    const newData = {
        private: isPrivate,
        owner,
        source: name,
    }
    const response = await appendToDataFile(newData, repositoriesFilePath)
    await res.json(response.data)
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
    const arrayData = await gitlabInstance.get(`${fileUrl}/raw?ref=${branch}`)
    arrayData.data.push(data)

    logger.log(`Updating data file "${filePath}"...`)
    const response = await gitlabInstance.put(`${fileUrl}`, {
        branch: branch,
        commit_message: "Automatic update from GitLab",
        content: JSON.stringify(arrayData.data, null, 2),
    })
    logger.log(`Data file "${filePath}" updated`)

    return response.data
}

module.exports = {
    mirrorRepository,
}