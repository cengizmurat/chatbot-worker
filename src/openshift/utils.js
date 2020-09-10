const axios = require('axios')
const https = require('https')
const config = require('../../config.js')
const logger = require('../logger')

const token = config.OPENSHIFT_TOKEN
const globalHeaders = { Authorization: `Bearer ${token}` }
const axiosInstance = axios.create({
    baseURL: config.OPENSHIFT_URL,
    headers: globalHeaders,
    httpsAgent: new https.Agent({
        rejectUnauthorized: config.INSECURE_REQUESTS !== 'true',
    }),
})

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
    logger.log(`POST ${config.OPENSHIFT_URL + url}`, 'TRACE')

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
    logger.log(`PUT ${config.OPENSHIFT_URL + url}`, 'TRACE')

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

    logger.log(`POST ${config.OPENSHIFT_URL + url}`, 'TRACE')

    const response = await axiosInstance.post(url, quotaSpecs)
    return response.data
}

async function updateResourceQuotas(projectName, quotaSpecs) {
    const url = `/api/v1/namespaces/${projectName}/resourcequotas/${quotaSpecs.metadata.name}`
    quotaSpecs.kind = "ResourceQuota"
    quotaSpecs.apiVersion = "v1"
    logger.log(`PUT ${config.OPENSHIFT_URL + url}`, 'TRACE')

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
    logger.log(`POST ${config.OPENSHIFT_URL + url}`, 'TRACE')

    const response = await axiosInstance.post(url, body)
    const role = response.data
    role.subjects = []

    return role
}

async function updateRoleBinding(roleBinding, projectName) {
    const url = `/apis/rbac.authorization.k8s.io/v1beta1/namespaces/${projectName}/rolebindings/${roleBinding.metadata.name}`
    logger.log(`PUT ${config.OPENSHIFT_URL + url}`, 'TRACE')

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

async function getMachineSets(namespace) {
    const url = `/apis/machine.openshift.io/v1beta1/namespaces/${namespace}/machinesets`
    logger.log(`GET ${config.OPENSHIFT_URL + url}`, 'TRACE')

    const response = await axiosInstance.get(url)
    return response.data
}

async function getInfrastructureInfo(infrastructureName) {
    const url = `/apis/config.openshift.io/v1/infrastructures/${infrastructureName}`
    logger.log(`GET ${config.OPENSHIFT_URL + url}`, 'TRACE')

    const response = await axiosInstance.get(url)
    return response.data
}

async function createPatchedMachineSet(namespace, projectName, replicas, instanceType, instances, instanceSize, billingModel, maxPrice = undefined) {
    const infrastructure = await getInfrastructureInfo('cluster')
    const infrastructureName = infrastructure.status.infrastructureName
    const region = infrastructure.status.platformStatus.aws.region

    const fullName = `${infrastructureName}-dw-${"tempgroup"}-${instanceType}-${region}`

    const machineSet = await createMachineSet(
        infrastructureName,
        region,
        namespace,
        projectName,
        fullName,
        0,
        instanceType,
        instances,
        instanceSize,
        billingModel,
        maxPrice
    )

    const newSpec = {
        replicas: replicas,
        template: {
            spec: {
                providerSpec: {
                    value: {
                        tags: [
                            {
                                name: `kubernetes.io/cluster/${infrastructureName}`,
                                value: "owned",
                            },
                        ],
                    },
                },
            },
        },
    }

    return await patchMachineSet(namespace, machineSet.metadata.name, newSpec)
}

async function createMachineSet(clusterName, region, namespace, projectName, name, replicas, instanceType, instances, instanceSize, billingModel, maxPrice = undefined) {
    const url = `/apis/machine.openshift.io/v1beta1/namespaces/${namespace}/machinesets`
    const metadata = {
        name: name,
        //namespace: namespace,
        labels: {
            "machine.openshift.io/cluster-api-cluster": projectName,
            "node-role.kubernetes.io/spot": "",
            region: region,
            type: instanceType,
        }
    }
    const providerSpec = {
        value: {
            apiVersion: "awsproviderconfig.openshift.io/v1beta1",
            //instanceType: "c5.xlarge",
            instanceType: instanceSize,
            kind: "AWSMachineProviderConfig",
            placement: {
                //availabilityZone: "eu-west-1b",
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
            tags: [
                {
                    name: `kubernetes.io/cluster/${clusterName}`,
                    value: 'owned',
                },
            ],
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
            }
        },
        providerSpec: providerSpec,
        taints: taints,
    }
    const template = {
        metadata: {
            labels: {
                "machine.openshift.io/cluster-api-cluster": projectName,
                "machine.openshift.io/cluster-api-machineset": name,
                "node-role.kubernetes.io/worker": ""
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
        replicas: 0,
        selector: {
            matchLabels: {
                "machine.openshift.io/cluster-api-cluster": projectName,
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
    logger.log(`POST ${config.OPENSHIFT_URL + url}`, 'TRACE')

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

    const patchHeaders = Object.assign({}, globalHeaders)
    patchHeaders['Content-Type'] = "application/merge-patch+json"

    logger.log(`PATCH ${config.OPENSHIFT_URL + url}`, 'TRACE')
    const response = await axios.patch(config.OPENSHIFT_URL + url, body,
        {
            headers: {
                patchHeaders,
            },
            httpsAgent: new https.Agent({
                rejectUnauthorized: config.INSECURE_REQUESTS !== 'true',
            }),
        },
    )
    return response.data
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
    getMachineSets,
    createPatchedMachineSet,
}