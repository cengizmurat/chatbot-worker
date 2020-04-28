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
    data.projects = projects

    return data
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
    getProjects,
    getRoleBindings,
    operationResult,
}