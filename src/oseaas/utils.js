const axios = require('axios')
const config = require('../../config.js')

const axiosInstance = axios.create({
    baseURL: config.OPENSHIFT_URL,
})

async function getToken() {
    const body = {
        grant_type: 'client_credentials',
        client_id: config.CLIENT_ID,
        client_secret: config.CLIENT_SECRET,
        redirect_uri: 'http://localhost:5000/v2/documentation/oauth2-redirect.html',
        response_type: 'code',
        scope: config.SCOPE,
    }

    const response = await axios.post(`${config.IAMAAS_URL}/v2/oauth2/token`, body, {
        headers: {
            'Content-Type': 'application/json',
        }
    })
    return response.data
}

async function getHeaders() {
    const tokenResponse = await getToken()
    return {
        headers: { Authorization: `Bearer ${tokenResponse.access_token}` },
    }
}

async function createProject(clusterName, projectName) {
    const body = {
        businessLine: 'GTS',
        projectSuffix: projectName,
    }
    const response = await axiosInstance.post(`/v1/clusters/${clusterName}/projects`, body, await getHeaders())
    return response.data
}

async function getProjects(clusterName) {
    const response = await axiosInstance.get(`/v1/clusters/${clusterName}/projects`, await getHeaders())
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

async function addRoleBinding(clusterName, projectName, userName, role) {
    const body = {
        user: userName,
        role: role,
    }

    const response = await axiosInstance.put(`/v1/clusters/${clusterName}/projects/${projectName}/rolebindings/users`, body, await getHeaders())
    return response.data
}

async function addRoleBindingResult(operationId, clusterName, username, role) {
    const result = await operationResult(operationId)
    const details = result.details
    if (details) {
        const action = details[`post_rolebinding_${clusterName}`]
        if (action) {
            const openshiftAction = action[`User-${username}-${role}`]
            if (openshiftAction) {
                return openshiftAction
            }
        }
    }
}

async function getRoleBindings(clusterName, project) {
    const response = await axiosInstance.get(`/v1/clusters/${clusterName}/projects/${project}/rolebindings`, await getHeaders())
    return response.data
}

async function operationResult(operationId) {
    const response = await axiosInstance.get(`/v1/operations/${operationId}`)
    return response.data
}

module.exports = {
    createProject,
    getProjects,
    addRoleBinding,
    addRoleBindingResult,
    getRoleBindings,
    operationResult,
}