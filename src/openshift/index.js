const express = require('express')

const utils = require('./utils')

const router = express.Router()

router.post('/projects', createProject)
router.get('/projects', getProjects)
router.delete('/projects/:project', deleteProject)

router.get('/projects/:project/resourcequotas', getResourceQuotas)
router.post('/projects/:project/resourcequotas', createResourceQuotas)
router.put('/projects/:project/resourcequotas', updateResourceQuotas)

router.get('/projects/:project/rolebindings', getRoleBindings)
router.post('/projects/:project/rolebindings', addUserToProject)
router.delete('/projects/:project/rolebindings/:username/:role', removeUserRoleFromProject)
router.delete('/projects/:project/rolebindings/:username', removeUserFromProject)

async function createProject(req, res, next) {
    const {project, username} = req.body

    if (project === undefined) {
        next(new Error('Missing parameter "project"'))
    } else if (username === undefined) {
        next(new Error('Missing parameter "username"'))
    } else try {
        const projectObj = await utils.createProjectRequest(project)
        await utils.updateProjectAnnotations(projectObj, username)
        await utils.addUserToRolebinding(projectObj.metadata.name, 'subadmin', username)
        await res.json(await utils.getProject(projectObj.metadata.name))
    } catch (e) {
        next(e)
    }
}

async function getProjects(req, res, next) {
    const username = req.query['username']

    try {
        const projects = []
        if (username) {
            const rolebindings = await utils.getRoleBindings()
            for (const rolebinding of rolebindings.items) {
                const roleMetadata = rolebinding.metadata
                const roleName = roleMetadata.name
                if (roleName === 'admin' || roleName === 'subadmin') {
                    for (const subject of rolebinding.subjects) {
                        if (subject.name === username) {
                            projects.push(roleMetadata.namespace)
                            break
                        }
                    }
                }
            }
        }

        await res.json(projects)
    } catch (e) {
        next(e)
    }
}

async function deleteProject(req, res, next) {
    const projectName = req.params['project']
    try {
        await res.json(await utils.deleteProject(projectName))
    } catch (e) {
        next(e)
    }
}

async function getResourceQuotas(req, res, next) {
    const projectName = req.params['project']
    try {
        await res.json(await utils.getResourceQuotas(projectName))
    } catch (e) {
        next(e)
    }
}

function getQuotaSpecs(quotaSize) {
    const scopes = ['NotTerminating', 'Terminating']
    const envPrefix = `QUOTA_${quotaSize.toUpperCase()}_`

    const specs = []
    for (const scope of scopes) {
        const metadata = {}
        const spec = {}
        for (const [key, value] of Object.entries(process.env)) {
            const prefixIndex = key.toUpperCase().indexOf(envPrefix)
            if (prefixIndex === 0) {
                const scopeIndex = key.indexOf(scope.toUpperCase(), envPrefix.length)
                if (scopeIndex === envPrefix.length + 1) {
                    const param = key.substring(scopeIndex + scope.length + 1)
                    if (param === 'NAME') {
                        metadata.name = value
                    } else {
                        spec[param.toLowerCase().replace(/_/g, '.')] = value
                    }
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
                    scopes: [ scope ]
                }
            })
        }
    }

    return specs
}

async function createResourceQuotas(req, res, next) {
    const { project, size } = req.body

    try {
        const specs = getQuotaSpecs(size)
        const results = []
        for (const spec of specs) {
            results.push(await utils.createResourceQuotas(project, spec))
        }
        await res.json(results)
    } catch (e) {
        next(e)
    }
}

async function keepQuotaSize(projectName, size) {
    const existingQuotas = await utils.getResourceQuotas(projectName)
    for (const quota of existingQuotas.items) {
        const metadata = quota.metadata
        if (metadata) {
            const annotations = metadata.annotations
            if (annotations) {
                const quotaSize = annotations['quota-size']
                if (quotaSize !== size) {
                    await utils.deleteResourceQuotas(projectName, metadata.name)
                }
            }
        }
    }
}

async function updateExistingQuotas(projectName, size) {
    const specs = getQuotaSpecs(size)
    const existingQuotas = await utils.getResourceQuotas(projectName)

    const results = []
    for (const spec of specs) {
        let specFound = false
        for (const quota of existingQuotas.items) {
            const metadata = quota.metadata
            if (metadata) {
                if (metadata.name === spec.metadata.name) {
                    results.push(await utils.updateResourceQuotas(projectName, spec))
                    specFound = true
                    break
                }
            }
        }
        if (!specFound) {
            results.push(await utils.createResourceQuotas(projectName, spec))
        }
    }

    return results
}

async function updateResourceQuotas(req, res, next) {
    const projectName = req.params['project']
    const { size } = req.body

    try {
        const updatedQuotas = await updateExistingQuotas(projectName, size)
        await keepQuotaSize(projectName, size)
        await res.json(updatedQuotas)
    } catch (e) {
        next(e)
    }
}

async function getRoleBindings(req, res, next) {
    const projectName = req.params['project']
    try {
        await res.json(await utils.getRoleBindings(projectName))
    } catch (e) {
        next(e)
    }
}

async function addUserToProject(req, res, next) {
    const projectName = req.params['project']
    const { role, username } = req.body

    if (role === undefined) {
        next(new Error('Missing parameter "role"'))
    } else if (username === undefined) {
        next(new Error('Missing parameter "username"'))
    } else try {
        const response = await utils.addUserToRolebinding(projectName, role, username)
        await res.json(response)
    } catch (e) {
        next(e)
    }
}

async function removeUserRoleFromProject(req, res, next) {
    const projectName = req.params['project']
    const username = req.params['username']
    const role = req.params['role']

    try {
        const roleBinding = await utils.getRoleBinding(role, projectName)
        const isSubject = roleBinding.subjects.map(subject => subject.name).indexOf(username) !== -1
        if (isSubject) {
            roleBinding.subjects = roleBinding.subjects.filter(subject => subject.name !== username)
            roleBinding.roleRef.kind = roleBinding.roleRef.kind || 'ClusterRole'
            return await utils.updateRoleBinding(roleBinding, projectName)
        }

        await res.json(roleBinding)
    } catch (e) {
        next(e)
    }
}

async function removeUserFromProject(req, res, next) {
    const projectName = req.params['project']
    const username = req.params['username']

    try {
        const roleBindings = await utils.getRoleBindings(projectName)
        for (const roleBinding of roleBindings.items) {
            if (roleBinding.roleRef.name !== 'admin') {
                const isSubject = roleBinding.subjects.map(subject => subject.name).indexOf(username) !== -1
                if (isSubject) {
                    roleBinding.subjects = roleBinding.subjects.filter(subject => subject.name !== username)
                    roleBinding.roleRef.kind = roleBinding.roleRef.kind || 'ClusterRole'
                    await utils.updateRoleBinding(roleBinding, projectName)
                }
            }
        }

        await res.json(await utils.getRoleBindings(projectName))
    } catch (e) {
        next(e)
    }
}

module.exports = router