const fs = require('fs')
const axios = require('axios')
const httpsProxyAgent = require('https-proxy-agent')
const simpleGit = require('simple-git')

const logger = require('../logger')
const config = require('../../config.js')

const agent = new httpsProxyAgent({
    host: config.PROXY_HOST,
    port: config.PROXY_PORT,
})

const gitlabInstance = axios.create({
    headers: { Authorization: `Bearer ${config.GITLAB_TOKEN}` },
    proxy: false,
    httpsAgent: agent,
})

const repoDirectory = 'imports'
const gitlabImportsGroupId = 984
let currentUserId

async function importRepository(req, res, next) {
    try {
        const orgId = req.params['orgId']
        const repoName = req.params['repoName']
        let {destination_url, vcs_url} = req.body
        destination_url = repoUrl(destination_url)
        vcs_url = repoUrl(vcs_url)

        logger.log(`Importing repository "${vcs_url}" to GitLab...`, 'INFO')

        const groupId = await getGroupId(orgId)
        const createdProject = await createProjectInGroup(groupId, repoName, vcs_url)

        const intervalID = setInterval(async function() {
            try {
                const url = `${config.GITLAB_URL}/api/v4/projects/${createdProject.id}`
                logger.log(`GET ${url}`, 'TRACE')
                const project = await gitlabInstance.get(url)
                if (project.data.import_status === 'finished') {
                    clearInterval(intervalID)

                    logger.log(`Importing GitLab repository to "${destination_url}"`, 'INFO')
                    const baseDirectory = `./${repoDirectory}/${orgId}`
                    fs.mkdirSync(baseDirectory, {recursive: true})

                    const git = simpleGit(baseDirectory)
                    await cloneGitLabRepository(repoName, baseDirectory, project.data, git)
                    const repoPath = `${baseDirectory}/${repoName}`
                    await pushGitLabRepository(repoPath, destination_url, git)

                    await res.json({result: 'OK'})
                } else if (project.data.import_status === 'failed') {
                    clearInterval(intervalID)
                    res.status(500)
                    await res.json({error: project.data.import_error})
                }
            } catch (e) {
                clearInterval(intervalID)
                next(e)
            }
        }, 1000)
    } catch (e) {
        next(e)
    }
}

function repoUrl(url) {
    return url + (url.endsWith('.git') ? '' : '.git')
}

async function getGroupId(groupName) {
    const getUrl = `${config.GITLAB_URL}/api/v4/groups/${gitlabImportsGroupId}/subgroups?search=${groupName}`
    logger.log(`GET ${getUrl}`, 'TRACE')
    const groups = await gitlabInstance.get(getUrl)

    for (const group of groups.data) {
        if (group.name === groupName) {
            return group.id
        }
    }

    const postUrl = `${config.GITLAB_URL}/api/v4/groups`
    const body = {
        name: groupName,
        path: groupName,
        parent_id: gitlabImportsGroupId,
    }
    logger.log(`POST ${postUrl}`, 'TRACE')
    const newGroup = await gitlabInstance.post(postUrl, body)
    return newGroup.data.id
}

async function getCurrentUserId() {
    if (currentUserId) {
        return currentUserId
    }

    const url = `${config.GITLAB_URL}/api/v4/user`
    logger.log(`GET ${url}`, 'TRACE')

    const response = await gitlabInstance.get(url)
    return response.data.id
}

async function createProjectInGroup(groupId, projectName, importUrl) {
    const url = `${config.GITLAB_URL}/api/v4/projects`
    const body = {
        namespace_id: groupId,
        name: projectName,
        import_url: importUrl,
        mirror: true,
        mirror_user_id: await getCurrentUserId(),
        mirror_trigger_builds: false,
        only_mirror_protected_branches: false,
    }

    logger.log(`POST ${url}`, 'TRACE')
    const project = await gitlabInstance.post(url, body)
    return project.data
}

async function cloneGitLabRepository(repoName, baseDirectory, project, git) {
    const repoPath = `${baseDirectory}/${repoName}`
    try {
        if (fs.lstatSync(repoPath).isDirectory()) {
            fs.rmdirSync(repoPath, {recursive: true})
        }
    } catch (e) {
    } finally {
        fs.mkdirSync(baseDirectory, {recursive: true})
    }

    logger.log(`Cloning repository "${project.http_url_to_repo}"...`, 'TRACE')
    await git.clone(
        authenticatedUrl('x-token-auth', config.GITLAB_TOKEN, project.http_url_to_repo),
        project.name,
        [
            '--config',
            `http.proxy=http://${config.PROXY_HOST}:${config.PROXY_PORT}`,
        ],
    )
    logger.log(`"${project.http_url_to_repo}" cloned`, 'TRACE')
}

async function pushGitLabRepository(repoPath, destination_url, git) {
    await git.cwd(repoPath)
    await git.removeRemote('origin')
    await git.addRemote(
        'origin',
        destination_url,
    )
    await git.addConfig('http.proxy', '', false) // Unset proxy locally

    logger.log(`Pushing to repository "${destination_url}"...`, 'TRACE')
    await git.push([
        '--all',
        authenticatedUrl(config.GITHUB_TOKEN, '', destination_url),
    ])

    logger.log(`Pushed to repository "${destination_url}"`, 'INFO')
}

function authenticatedUrl(user, password, url) {
    const httpsUrl = 'https://'
    const isHttps = url.startsWith(httpsUrl)

    return `http${isHttps ? 's' : ''}://${user}${(password ? ':' : '') + password}@${url.substring(httpsUrl.length - (isHttps ? 0 : 1))}`
}

module.exports = {
    importRepository,
}