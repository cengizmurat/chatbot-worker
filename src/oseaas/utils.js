const axios = require('axios')
const ldap = require('./ldap.js')
const config = require('../../config.js')
const logger = require('../logger')

const axiosInstance = axios.create({
    baseURL: config.OPENSHIFT_URL,
})

let token

async function renewToken() {
    const body = {
        grant_type: 'client_credentials',
        client_id: config.CLIENT_ID,
        client_secret: config.CLIENT_SECRET,
        redirect_uri: 'http://localhost:5000/v2/documentation/oauth2-redirect.html',
        response_type: 'code',
        scope: config.SCOPE,
    }

    const url = `${config.IAMAAS_URL}/v2/oauth2/token`
    logger.log(`POST ${url}`, 'TRACE')

    const response = await axios.post(url, body, {
        headers: {
            'Content-Type': 'application/json',
        }
    })
    return response.data
}

async function getHeaders() {
    let expired = true
    if (token && token.expires_at) {
        expired = Date.now() >= token.expires_at
    }

    if (expired) {
        const tokenResponse = await renewToken()
        tokenResponse.expires_at = Date.now() + parseInt(tokenResponse.expires_in) * 1000
        token = tokenResponse
    }

    return {
        headers: { Authorization: `Bearer ${token.access_token}` },
    }
}

async function createProject(clusterName, projectName) {
    const body = {
        businessLine: 'GTS',
        projectSuffix: projectName,
    }

    const url = `/v1/clusters/${clusterName}/projects`
    logger.log(`POST ${config.OPENSHIFT_URL + url}`, 'TRACE')

    const headers = await getHeaders()
    const response = await axiosInstance.post(url, body, headers)
    logger.log(`Creating project "${projectName}" in cluster ${clusterName}...`, 'INFO')
    return response.data
}

async function getProjects(clusterName) {
    const url = `/v1/clusters/${clusterName}/projects`
    logger.log(`GET ${config.OPENSHIFT_URL + url}`, 'TRACE')

    const headers = await getHeaders()
    const response = await axiosInstance.get(url, headers)
    const data = response.data
    const projects = []
    for (let i in data.projects) {
        const project = data.projects[i]
        if (project.endsWith(clusterName)) {
            projects.push(project.substring(0, project.length - (clusterName.length + 1)))
        }
    }

    return projects
}

async function deleteProject(clusterName, projectName) {
    const url = `/v1/clusters/${clusterName}/projects/${projectName}`
    logger.log(`DELETE ${config.OPENSHIFT_URL + url}`, 'TRACE')

    const headers = await getHeaders()
    const response = await axiosInstance.delete(url, headers)
    logger.log(`Deleting project "${projectName}" in cluster ${clusterName}...`, 'INFO')
    return response.data
}

async function addRoleBinding(clusterName, projectName, userName, role) {
    const body = {
        user: userName,
        role: role,
    }

    const url = `/v1/clusters/${clusterName}/projects/${projectName}/rolebindings/users`
    logger.log(`PUT ${config.OPENSHIFT_URL + url}`, 'TRACE')

    const headers = await getHeaders()
    const response = await axiosInstance.put(url, body, headers)
    logger.log(`Adding ${role} role to ${userName} in project "${projectName}"...`, 'INFO')
    return response.data
}

async function updateRoleBindingResult(operation, actionName) {
    const details = operation.details
    if (details) {
        const action = details[actionName]
        if (action) {
            const openshiftAction = Object.values(action)[0]
            if (openshiftAction) {
                return openshiftAction
            }
        }
    }
}

async function getRoleBindings(clusterName, projectName) {
    const url = `/v1/clusters/${clusterName}/projects/${projectName}/rolebindings`
    logger.log(`GET ${config.OPENSHIFT_URL + url}`, 'TRACE')

    const headers = await getHeaders()
    const response = await axiosInstance.get(url, headers)
    return response.data
}

async function deleteRoleBinding(clusterName, projectName, userName, role) {
    const body = {
        user: userName,
        role: role,
    }

    const url = `/v1/clusters/${clusterName}/projects/${projectName}/rolebindings/users`
    logger.log(`DELETE ${config.OPENSHIFT_URL + url}`, 'TRACE')

    const config = {
        data: body,
    }
    const headers = await getHeaders()
    Object.assign(config, headers)
    const response = await axiosInstance.delete(url, config)
    logger.log(`Removing ${role} role from ${userName} in project "${projectName}"...`, 'INFO')
    return response.data
}

async function operationResult(operationId) {
    const url = `/v1/operations/${operationId}`
    logger.log(`GET ${config.OPENSHIFT_URL + url}`, 'TRACE')

    const response = await axiosInstance.get(url)
    return response.data
}

async function getUserFromLdap(filters) {
    for (const [key, value] of Object.entries(filters)) {
        if (key === 'sgzoneid') {
            if (value.startsWith('1')) {
                filters[key] = '9' + value.substring(1)
            }
        }
    }
    const users = await ldap.search(filters)
    if (users && users.length > 0) {
        const user = users[0]
        if (user.sgzoneid) {
            const sgZoneIdStr = user.sgzoneid.toString()
            if (sgZoneIdStr.startsWith('9')) {
                user.sgzoneid = parseInt('1' + sgZoneIdStr.substring(1))
            }
        }
        return user
    }
}

module.exports = {
    createProject,
    getProjects,
    deleteProject,
    addRoleBinding,
    updateRoleBindingResult,
    getRoleBindings,
    deleteRoleBinding,
    operationResult,
    getUserFromLdap,
}