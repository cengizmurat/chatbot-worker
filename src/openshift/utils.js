const axios = require('axios')
const https = require('https')
const config = require('../../config.js')
const logger = require('../logger')

const token = config.OPENSHIFT_TOKEN
const globalConfig = {
    headers: { Authorization: `Bearer ${token}` },
    httpsAgent: new https.Agent({
        rejectUnauthorized: config.INSECURE_REQUESTS !== 'true',
    }),
}
const axiosInstance = axios.create({
    baseURL: config.OPENSHIFT_URL,
    headers: globalConfig.headers,
    httpsAgent: globalConfig.httpsAgent,
})

async function getGroup(name) {
    const url = `/apis/user.openshift.io/v1/groups/${name}`
    logger.log(`GET ${config.OPENSHIFT_URL + url}`, 'TRACE')
    const response = await axiosInstance.get(url)

    return response.data
}

async function getGroupsForUser(userName) {
    const url = `/apis/user.openshift.io/v1/groups`
    logger.log(`GET ${config.OPENSHIFT_URL + url}`, 'TRACE')
    const response = await axiosInstance.get(url)

    return response.data.items
        .filter(group => group.users.indexOf(userName) !== -1)
}

async function createGroup(name, users) {
    const url = `/apis/user.openshift.io/v1/groups`
    const body = {
        kind: "Group",
        apiVersion: "user.openshift.io/v1",
        metadata: {
            name: name,
            labels: {
                "openshift.io/ldap.host": "ldap.cip-ldap-common.svc.cluster.local",
            },
            annotations: {
                "openshift.io/ldap.uid": `cn=${name},ou=groups,ou=dev,ou=iam,dc=sgcip,dc=com`,
                "openshift.io/ldap.url": "ldap.cip-ldap-common.svc.cluster.local:389",
            },
        },
        users: users,
    }
    logger.log(`POST ${config.OPENSHIFT_URL + url} ${JSON.stringify(body)}`, 'TRACE')

    const response = await axiosInstance.post(url, body)

    return response.data
}

async function deleteGroup(name) {
    const url = `/apis/user.openshift.io/v1/groups/${name}`
    logger.log(`DELETE ${config.OPENSHIFT_URL + url}`, 'TRACE')

    const response = await axiosInstance.delete(url)
    return response.data
}

async function updateGroup(name, body) {
    const url = `/apis/user.openshift.io/v1/groups/${name}`
    logger.log(`PUT ${config.OPENSHIFT_URL + url} ${JSON.stringify(body)}`, 'TRACE')

    const response = await axiosInstance.put(url, body)
    return response.data
}

async function getProject(projectName) {
    const url = `/apis/project.openshift.io/v1/projects/${projectName}`
    logger.log(`GET ${config.OPENSHIFT_URL + url}`, 'TRACE')

    const response = await axiosInstance.get(url)
    return response.data
}

async function deleteProject(projectName) {
    const url = `/apis/project.openshift.io/v1/projects/${projectName}`
    logger.log(`DELETE ${config.OPENSHIFT_URL + url}`, 'TRACE')

    const response = await axiosInstance.delete(url)
    return response.data
}

async function createProjectRequest(projectName) {
    const url = `/apis/project.openshift.io/v1/projectrequests`
    /*
    const defaultNodeSelectors = {
        "machine.openshift.io/cluster-api-cluster": projectName,
    }
    */
    const body = {
        kind: "ProjectRequest",
        apiVersion: "project.openshift.io/v1",
        metadata: {
            name: projectName,
            annotations: {
                //"openshift.io/node-selector": Object.entries(defaultNodeSelectors).map(entry => `${entry[0]}=${entry[1]}`).join(','),
            },
        }
    }
    logger.log(`POST ${config.OPENSHIFT_URL + url} ${JSON.stringify(body)}`, 'TRACE')

    const response = await axiosInstance.post(url, body)
    return response.data
}

async function updateProjectAnnotations(project, username, taintTolerations) {
    const url = `/api/v1/namespaces/${project.metadata.name}`
    const body = {
        kind: "Namespace",
        apiVersion: "v1",
        metadata: {
            name: project.metadata.name,
            annotations: {
                "cip-allowed-tolerations-keys": taintTolerations.length > 0 ? taintTolerations.join(',') : undefined,
                "openshift.io/requester": username,
                "openshift.io/description": project.metadata.annotations['openshift.io/description'],
                "openshift.io/display-name": project.metadata.annotations['openshift.io/display-name']
            },
            "labels": {
                "redhat-cop.github.com/gatekeeper-active": "true",
            },
        }
    }
    logger.log(`PUT ${config.OPENSHIFT_URL + url} ${JSON.stringify(body)}`, 'TRACE')

    const response = await axiosInstance.put(url, body)
    return response.data
}

async function getResourceQuotas(projectName) {
    const url = `/api/v1/namespaces/${projectName}/resourcequotas`
    logger.log(`GET ${config.OPENSHIFT_URL + url}`, 'TRACE')

    const response = await axiosInstance.get(url)
    return response.data
}

async function createResourceQuotas(projectName, quotaSpecs) {
    const url = `/api/v1/namespaces/${projectName}/resourcequotas`
    quotaSpecs.kind = "ResourceQuota"
    quotaSpecs.apiVersion = "v1"

    logger.log(`POST ${config.OPENSHIFT_URL + url} ${JSON.stringify(quotaSpecs)}`, 'TRACE')

    const response = await axiosInstance.post(url, quotaSpecs)
    return response.data
}

async function updateResourceQuotas(projectName, quotaSpecs) {
    const url = `/api/v1/namespaces/${projectName}/resourcequotas/${quotaSpecs.metadata.name}`
    quotaSpecs.kind = "ResourceQuota"
    quotaSpecs.apiVersion = "v1"
    logger.log(`PUT ${config.OPENSHIFT_URL + url} ${JSON.stringify(quotaSpecs)}`, 'TRACE')

    const response = await axiosInstance.put(url, quotaSpecs)
    return response.data
}

async function deleteResourceQuotas(projectName, quotaName) {
    const url = `/api/v1/namespaces/${projectName}/resourcequotas/${quotaName}`
    logger.log(`DELETE ${config.OPENSHIFT_URL + url}`, 'TRACE')

    const response = await axiosInstance.delete(url)
    return response.data
}

function isScopedParam(param, scopes) {
    for (const otherScope of scopes.filter(s => s.length > 0)) {
        if (param.startsWith(otherScope.toUpperCase())) {
            return true
        }
    }

    return false
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
                if (!isScopedParam(param, scopes)) {
                    if (param === 'NAME') {
                        metadata.name = value
                    } else {
                        spec[param.toLowerCase().replace(/_/g, '.')] = value
                    }
                }
            }
        }

        if (metadata.name) {
            metadata.labels = {
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
            const labels = metadata.labels
            if (labels) {
                const quotaSize = labels['quota-size']
                if (quotaSize !== size) {
                    await deleteResourceQuotas(projectName, metadata.name)
                }
            }
        }
    }
}

async function updateExistingQuotas(projectName, size) {
    const specs = getQuotaSpecs(size)
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
    logger.log(`POST ${config.OPENSHIFT_URL + url} ${JSON.stringify(body)}`, 'TRACE')

    const response = await axiosInstance.post(url, body)
    const role = response.data
    role.subjects = []

    return role
}

async function updateRoleBinding(roleBinding, projectName) {
    const url = `/apis/rbac.authorization.k8s.io/v1beta1/namespaces/${projectName}/rolebindings/${roleBinding.metadata.name}`
    logger.log(`PUT ${config.OPENSHIFT_URL + url} ${JSON.stringify(roleBinding)}`, 'TRACE')

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
    logger.log(`GET ${config.OPENSHIFT_URL + url}`, 'TRACE')

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

async function getMachineSets(namespace, group) {
    let url = `/apis/machine.openshift.io/v1beta1/namespaces/${namespace}/machinesets`
    if (group) {
        url += `?labelSelector=cip/group=${group}`
    }
    logger.log(`GET ${config.OPENSHIFT_URL + url}`, 'TRACE')

    const response = await axiosInstance.get(url)
    return response.data
}

async function getMachineSet(namespace, name) {
    const url = `/apis/machine.openshift.io/v1beta1/namespaces/${namespace}/machinesets/${name}`
    logger.log(`GET ${config.OPENSHIFT_URL + url}`, 'TRACE')

    const response = await axiosInstance.get(url)
    return response.data
}

async function deleteMachineSet(namespace, name) {
    const url = `/apis/machine.openshift.io/v1beta1/namespaces/${namespace}/machinesets/${name}`
    logger.log(`DELETE ${config.OPENSHIFT_URL + url}`, 'TRACE')

    const response = await axiosInstance.delete(url)
    return response.data
}

async function getInfrastructureInfo(infrastructureName) {
    const url = `/apis/config.openshift.io/v1/infrastructures/${infrastructureName}`
    logger.log(`GET ${config.OPENSHIFT_URL + url}`, 'TRACE')

    const response = await axiosInstance.get(url)
    return response.data
}

async function createPatchedMachineSet(namespace, group, type, billing, replicas, instanceSize, maxPrice = undefined) {
    const infrastructure = await getInfrastructureInfo('cluster')
    const infrastructureName = infrastructure.status.infrastructureName
    const region = infrastructure.status.platformStatus.aws.region
    const machinesetType = `dw-${group}-${type}-${billing}`
    const fullName = `${infrastructureName}-${machinesetType}-${region}`

    let machineSet
    try {
        machineSet = await getMachineSet(namespace, fullName)
    } catch (e) {
        if (e.response && e.response.status === 404) { // MachineSet not found
            machineSet = await createMachineSet(
                infrastructureName,
                region,
                namespace,
                group,
                fullName,
                machinesetType,
                replicas,
                instanceSize,
                maxPrice,
            )
        } else {
            throw e
        }
    }

    return machineSet
}

async function createMachineSet(clusterName, region, namespace, group, name, instanceType, replicas, instanceSize, maxPrice = undefined) {
    const url = `/apis/machine.openshift.io/v1beta1/namespaces/${namespace}/machinesets`
    const metadata = {
        name: name,
        labels: {
            "machine.openshift.io/cluster-api-cluster": clusterName,
            "node-role.kubernetes.io/spot": "",
            region: region,
            type: instanceType,
            "cip/group": group,
        }
    }
    const providerSpec = {
        value: {
            apiVersion: "awsproviderconfig.openshift.io/v1beta1",
            instanceType: instanceSize,
            kind: "AWSMachineProviderConfig",
            placement: {
                region: region,
            },
            credentialsSecret: {
                name: "aws-cloud-credentials",
            },
            ami: {
                id: config.MACHINESET_AMI_ID,
            },
            subnet: {
                id: config.MACHINESET_SUBNET_ID,
            },
            securityGroups: [
                {
                    filters: [
                        {
                            name: "tag:Name",
                            values: [
                                `${clusterName}-worker-sg`,
                            ],
                        },
                    ],
                },
            ],
            tags: [
                {
                    name: `kubernetes.io/cluster/${clusterName}`,
                    value: 'owned',
                },
            ],
            deviceIndex: 0,
            iamInstanceProfile: {
                id: `${clusterName}-worker-profile`,
            },
            userDataSecret: {
                name: "worker-user-data",
            },
        }
    }
    if (instanceType.indexOf('spot') > -1) {
        providerSpec.value['InstanceLifecycle'] = 'spot'
        providerSpec.value.spotMarketOptions = {
            maxPrice: maxPrice,
        }
    }
    const taints = [
        {
            effect: "NoSchedule", // NoExecute
            key: instanceType,
            value: "",
        }
    ]
    const templateSpec = {
        metadata: {
            labels: {
                type: instanceType,
                "cip/group": group,
            }
        },
        providerSpec: providerSpec,
        taints: taints,
    }
    const template = {
        metadata: {
            labels: {
                "machine.openshift.io/cluster-api-cluster": clusterName,
                "machine.openshift.io/cluster-api-machineset": name,
                "machine.openshift.io/cluster-api-machine-role": instanceType,
                "machine.openshift.io/cluster-api-machine-type": instanceType,
                "node-role.kubernetes.io/worker": "",
                "cip/group": group,
            }
        },
        spec: templateSpec,
    }
    if (instanceType.indexOf('spot') > -1) {
        template.metadata.labels['machine.openshift.io/cluster-api-machine-role'] = 'spot'
        template.metadata.labels['machine.openshift.io/cluster-api-machine-type'] = 'spot'
    } else {
        template.metadata.labels['machine.openshift.io/cluster-api-machine-role'] = 'worker'
        template.metadata.labels['machine.openshift.io/cluster-api-machine-type'] = 'worker'
    }
    const spec = {
        replicas: replicas,
        selector: {
            matchLabels: {
                "machine.openshift.io/cluster-api-cluster": clusterName,
                "machine.openshift.io/cluster-api-machineset": name,
            }
        },
        template: template,
    }

    const body = {
        apiVersion: "machine.openshift.io/v1beta1",
        kind: "MachineSet",
        metadata: metadata,
        spec: spec,
    }
    logger.log(`POST ${config.OPENSHIFT_URL + url} ${JSON.stringify(body)}`, 'TRACE')

    const response = await axiosInstance.post(url, body)
    return response.data
}

async function patchMachineSet(namespace, name, spec) {
    const url = `/apis/machine.openshift.io/v1beta1/namespaces/${namespace}/machinesets/${name}`
    const metadata = {
        name: name,
    }

    const body = {
        apiVersion: "machine.openshift.io/v1beta1",
        kind: "MachineSet",
        metadata: metadata,
        spec: spec,
    }

    const patchConfig = Object.assign({}, globalConfig)
    patchConfig.headers['Content-Type'] = "application/merge-patch+json"

    logger.log(`PATCH ${config.OPENSHIFT_URL + url} ${JSON.stringify(body)}`, 'TRACE')
    const response = await axios.patch(config.OPENSHIFT_URL + url, body, patchConfig)
    return response.data
}

module.exports = {
    getGroup,
    getGroupsForUser,
    createGroup,
    deleteGroup,
    updateGroup,
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
    getMachineSet,
    getMachineSets,
    deleteMachineSet,
    createPatchedMachineSet,
}