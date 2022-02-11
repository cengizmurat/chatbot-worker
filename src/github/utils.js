const axios = require('axios')

const logger = require('../logger.js')
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

clearRepositories()

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

        const decodedUrl = decodeUrl(url)
        const gitUrl = parseGitUrl(decodedUrl)
        if (!gitUrl) {
            res.statusCode = 400
            return await res.json({message: 'Malformed Git URL'})
        }

        let project;
        try {
            project = await createEmptyProject(name, owner)
        } catch (e) {
            return await handleError(e, res);
        }

        const newData = {
            private: isPrivate.toString().toLowerCase() === 'true',
            owner,
            source: name,
            url: gitUrl,
        }
        await appendToDataFile(newData)

        logger.log('Waiting for destination server to respond...')
        const dataUpdated = await waitForDestination(owner, name)
        if (!dataUpdated) {
            deleteProject(project).finally(function() {
                removeFromDataFile(owner, name)
            })
            res.statusCode = 503
            return await res.json({
                message: 'Waited too long for destination server',
            })
        }
        logger.log('Destination server OK')

        const exportUrl = `${exportUrlBase}/${owner}/${name}.git`
        await configurePushMirror(project, exportUrl)
        await configurePullMirror(project, decodedUrl)

        dataUpdated.destinationUrl = config.DESTINATION_URL
        dataUpdated.middleUrl = project.web_url
        await res.json(dataUpdated)
    } catch (e) {
        console.error(e)
        next(e)
    }
}

async function getProject(id) {
    if (parseInt(id).toString() !== id) {
        id = encodeURIComponent(id)
    }

    const response = await gitlabInstance.get(`/projects/${id}`)
    return response.data
}

async function clearRepositories() {
    const groupResponse = await gitlabInstance.get(`/groups/${gitlabImportsGroupId}`)
    const group = groupResponse.data
    let data = await getDataFile()
    for (const object of data) {
        if (object.failed) {
            try {
                const project = await getProject(`${group.full_path}/${object.owner}/${object.source}`)
                await deleteProject(project)
                object.deletedFromSource = true
            } catch (e) {
                handleError(e)
            }
        }
    }

    await updateDataFile(data.filter(object => !(object.deletedFromSource && object.deletedFromDestination)))
}

async function handleError(e, res) {
    const response = e.response;
    if (response) {
        delete response.request;
        console.error(response);
        if (res) {
            res.statusCode = response.status;
            await res.json(response.data);
        }
    } else {
        console.error(e);
        if (res) {
            res.statusCode = 500;
            await res.json({message: 'Unknown error'});
        }
    }
}

function parseGitUrl(url) {
    const protocolString = '://'
    const index = url.indexOf(protocolString)
    if (index === -1) {
        return {}
    }
    const protocolIndex = index + protocolString.length
    const slashString = '/'
    const slashIndex = url.indexOf(slashString, protocolIndex)
    const host = url.substring(protocolIndex, slashIndex)
    const atSymbol = '@'
    const atIndex = host.lastIndexOf(atSymbol)

    const token = host.substring(0, atIndex) // ignored
    return url.substring(0, protocolIndex) + url.substring(protocolIndex + atIndex + 1)
}

async function deleteProject(project) {
    logger.log(`Delete project "${project.path_with_namespace}"...`)
    await gitlabInstance.delete(`/projects/${project.id}`)
    logger.log(`Project "${project.path_with_namespace}" deleted`)
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

async function appendToDataFile(data) {
    const arrayData = await getDataFile()
    arrayData.push(data)

    return await updateDataFile(arrayData)
}

async function removeFromDataFile(owner, repo) {
    let arrayData = await getDataFile()
    arrayData = arrayData.filter(data => data.owner !== owner && data.source !== repo)

    return await updateDataFile(arrayData)
}

async function updateDataFile(data, branch = 'master') {
    const fileUrl = `/projects/${syncRepositoryId}/repository/files/${encodeURIComponent(repositoriesFilePath)}`

    logger.log(`Updating data file "${repositoriesFilePath}"...`)
    const response = await gitlabInstance.put(`${fileUrl}`, {
        branch: branch,
        commit_message: "Automatic update from GitLab",
        content: JSON.stringify(data, null, 2),
    })
    logger.log(`Data file "${repositoriesFilePath}" updated`)

    return response.data
}

async function getDataFile(branch = 'master') {
    const fileUrl = `/projects/${syncRepositoryId}/repository/files/${encodeURIComponent(repositoriesFilePath)}`
    const response = await gitlabInstance.get(`${fileUrl}/raw?ref=${branch}`)
    return response.data
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForDestination(owner, source) {
    let data = await getDataFile()
    const now = new Date()
    while (data.filter(object =>
      object.owner === owner &&
      object.source === source &&
      object.destination
    ).length === 0) {
        await sleep(gitlabCheckInterval * 1000)
        data = await getDataFile()
        const diffSeconds = (new Date() - now) / 1000
        if (diffSeconds > gitlabTimeout) {
            return
        }
    }

    return data.filter(object =>
        object.owner === owner &&
        object.source === source &&
        object.destination
    )[0]
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