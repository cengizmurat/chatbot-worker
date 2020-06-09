const axios = require('axios')
const config = require('../../config.js')
const logger = require('../logger')

const token = config.OPENSHIFT_TOKEN
const axiosInstance = axios.create({
    baseURL: config.OPENSHIFT_URL,
    headers: { Authorization: `Bearer ${token}` }
})

async function getProject(projectName) {
    const url = `/apis/project.openshift.io/v1/projects/${projectName}`
    logger.log(`GET ${url}`, 'TRACE')

    const response = await axiosInstance.get(url)
    return response.data
}

async function deleteProject(projectName) {
    const url = `/apis/project.openshift.io/v1/projects/${projectName}`
    logger.log(`DELETE ${url}`, 'TRACE')

    const response = await axiosInstance.delete(url)
    return response.data
}

async function createProjectRequest(projectName) {
    const url = `/apis/project.openshift.io/v1/projectrequests`
    const body = {
        kind: "ProjectRequest",
        apiVersion: "project.openshift.io/v1",
        metadata: {
            name: projectName,
        }
    }
    logger.log(`POST ${url}`, 'TRACE')

    const response = await axiosInstance.post(url, body)
    return response.data
}

async function updateProjectAnnotations(project, username) {
    const url = `/api/v1/namespaces/${project.metadata.name}`
    const body = {
        kind: "Namespace",
        apiVersion: "v1",
        metadata: {
            name: project.metadata.name,
            annotations: {
                "openshift.io/requester": username,
                "openshift.io/description": project.metadata.annotations['openshift.io/description'],
                "openshift.io/display-name": project.metadata.annotations['openshift.io/display-name']
            }
        }
    }
    logger.log(`PUT ${url}`, 'TRACE')

    const response = await axiosInstance.put(url, body)
    return response.data
}

async function getResourceQuotas(projectName) {
    const url = `/api/v1/namespaces/${projectName}/resourcequotas`
    logger.log(`GET ${url}`, 'TRACE')

    const response = await axiosInstance.get(url)
    return response.data
}

async function createResourceQuotas(projectName, quotaSpecs) {
    const url = `/api/v1/namespaces/${projectName}/resourcequotas`
    quotaSpecs.kind = "ResourceQuota"
    quotaSpecs.apiVersion = "v1"

    logger.log(`POST ${url}`, 'TRACE')

    const response = await axiosInstance.post(url, quotaSpecs)
    return response.data
}

async function updateResourceQuotas(projectName, quotaSpecs) {
    const url = `/api/v1/namespaces/${projectName}/resourcequotas/${quotaSpecs.metadata.name}`
    quotaSpecs.kind = "ResourceQuota"
    quotaSpecs.apiVersion = "v1"
    logger.log(`PUT ${url}`, 'TRACE')

    const response = await axiosInstance.put(url, quotaSpecs)
    return response.data
}

async function deleteResourceQuotas(projectName, quotaName) {
    const url = `/api/v1/namespaces/${projectName}/resourcequotas/${quotaName}`
    logger.log(`DELETE ${url}`, 'TRACE')

    const response = await axiosInstance.delete(url)
    return response.data
}

function getQuotaSpecs(quotaSize) {
    const scopes = ['', 'NotTerminating', 'Terminating']

    const specs = []
    for (const scope of scopes) {
        const envPrefix = `QUOTA_${quotaSize.toUpperCase()}_${scope ? (scope.toUpperCase() + '_') : ''}`

        const metadata = {}
        const spec = {}
        for (const [key, value] of Object.entries(process.env)) {
            const prefixIndex = key.toUpperCase().indexOf(envPrefix)
            if (prefixIndex === 0) {
                const param = key.substring(envPrefix.length)
                if (param === 'NAME') {
                    metadata.name = value
                } else {
                    spec[param.toLowerCase().replace(/_/g, '.')] = value
                }
            }
        }

        if (metadata.name) {
            metadata.annotations = {
                'quota-size': quotaSize
            }
            specs.push({
                metadata: metadata,
                spec: {
                    hard: spec,
                    scopes: scope ? [ scope ] : undefined
                }
            })
        }
    }

    return specs
}

async function keepQuotaSize(projectName, size) {
    const existingQuotas = await getResourceQuotas(projectName)
    for (const quota of existingQuotas.items) {
        const metadata = quota.metadata
        if (metadata) {
            const annotations = metadata.annotations
            if (annotations) {
                const quotaSize = annotations['quota-size']
                if (quotaSize !== size) {
                    await deleteResourceQuotas(projectName, metadata.name)
                }
            }
        }
    }
}

async function updateExistingQuotas(projectName, size) {
    const specs = getQuotaSpecs(size)
    console.log(JSON.stringify(specs, null, 2))
    const existingQuotas = await getResourceQuotas(projectName)

    const results = []
    for (const spec of specs) {
        let specFound = false
        for (const quota of existingQuotas.items) {
            const metadata = quota.metadata
            if (metadata) {
                if (metadata.name === spec.metadata.name) {
                    results.push(await updateResourceQuotas(projectName, spec))
                    specFound = true
                    break
                }
            }
        }
        if (!specFound) {
            results.push(await createResourceQuotas(projectName, spec))
        }
    }

    return results
}

async function updateProjectQuotas(projectName, size) {
    const results = await updateExistingQuotas(projectName, size)
    await keepQuotaSize(projectName, size)

    return results
}

async function createRoleBinding(roleName, projectName) {
    const url = `/apis/rbac.authorization.k8s.io/v1beta1/namespaces/${projectName}/rolebindings`
    const body = {
        kind: 'RoleBinding',
        apiVersion: 'rbac.authorization.k8s.io/v1beta1',
        metadata: {
            name: roleName
        },
        roleRef: {
            kind: 'ClusterRole',
            name: roleName
        }
    }
    logger.log(`POST ${url}`, 'TRACE')

    const response = await axiosInstance.post(url, body)
    const role = response.data
    role.subjects = []

    return role
}

async function updateRoleBinding(roleBinding, projectName) {
    const url = `/apis/rbac.authorization.k8s.io/v1beta1/namespaces/${projectName}/rolebindings/${roleBinding.metadata.name}`
    logger.log(`PUT ${url}`, 'TRACE')

    const response = await axiosInstance.put(url, roleBinding)
    return response.data
}

async function getRoleBindings(projectName) {
    let url
    if (projectName === undefined) {
        url = '/apis/rbac.authorization.k8s.io/v1beta1/rolebindings'
    } else {
        url = `/apis/authorization.openshift.io/v1/namespaces/${projectName}/rolebindings`
    }
    logger.log(`GET ${url}`, 'TRACE')

    const rolebindings = await axiosInstance.get(url)
    return rolebindings.data
}

async function getRoleBinding(roleName, projectName) {
    const roleBindings = await getRoleBindings(projectName)

    for (const rolebinding of roleBindings.items) {
        if (rolebinding.metadata.name === roleName) {
            if (rolebinding.subjects === undefined) {
                rolebinding.subjects = []
            }
            rolebinding.roleRef.kind = rolebinding.roleRef.kind || 'ClusterRole'
            return rolebinding
        }
    }
}

async function addUserToRolebinding(projectName, roleName, username) {
    const roleBinding = await getRoleBinding(roleName, projectName) || await createRoleBinding(roleName, projectName)
    roleBinding.subjects.push({
        kind: 'User',
        apiGroup: 'rbac.authorization.k8s.io',
        name: username
    })

    return await updateRoleBinding(roleBinding, projectName)
}

module.exports = {
    getProject,
    deleteProject,
    createProjectRequest,
    updateProjectAnnotations,
    getResourceQuotas,
    updateProjectQuotas,
    updateRoleBinding,
    getRoleBinding,
    getRoleBindings,
    addUserToRolebinding,
}