const express = require('express')

const utils = require('./utils')

const router = express.Router()

router.post('/projects', createProject)
router.get('/projects', getProjects)
router.delete('/projects/:project', deleteProject)

router.get('/projects/:project/resourcequotas', getResourceQuotas)
router.post('/projects/:project/resourcequotas', createResourceQuotas)

router.get('/projects/:project/rolebindings', getRoleBindings)
router.post('/projects/:project/rolebindings', addUserToProject)
router.delete('/projects/:project/rolebindings/:username/:role', removeUserRoleFromProject)
router.delete('/projects/:project/rolebindings/:username', removeUserFromProject)

router.get('/projects/:project/machinesets', getMachineSets)
router.post('/projects/:project/machinesets', createMachineSet)

async function createProject(req, res, next) {
    const {project, username, taintTolerations = []} = req.body

    if (project === undefined) {
        next(new Error('Missing parameter "project"'))
    } else if (username === undefined) {
        next(new Error('Missing parameter "username"'))
    } else try {
        const machineSetNamespace = 'openshift-machine-api'
        const machineSetRegion = 'eu-west-1'
        const machineSetReplicas = 1
        const machineSetSize = 'c5.xlarge'
        const machineSetBillingModel = 'ondemand'
        for (const toleration of taintTolerations) {
            await utils.createMachineSet(
                machineSetNamespace,
                project,
                machineSetRegion,
                machineSetReplicas,
                toleration,
                {},
                machineSetSize,
                machineSetBillingModel
            )
        }
        const projectObj = await utils.createProjectRequest(project)
        await utils.updateProjectAnnotations(projectObj, username, taintTolerations)
        const projectName = projectObj.metadata.name
        await utils.updateProjectQuotas(projectName, 'small') // default project quota size
        await utils.addUserToRolebinding(projectName, 'subadmin', username)
        await res.json(await utils.getProject(projectName))
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
        await res.json((await utils.getResourceQuotas(projectName)).items)
    } catch (e) {
        next(e)
    }
}

async function createResourceQuotas(req, res, next) {
    const projectName = req.params['project']
    const { size } = req.body

    try {
        await res.json(await utils.updateProjectQuotas(projectName, size))
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

async function getMachineSets(req, res, next) {
    const namespace = req.params['project']
    try {
        await res.json((await utils.getMachineSets(namespace)).items)
    } catch (e) {
        next(e)
    }
}

async function createMachineSet(req, res, next) {
    const namespace = req.params['project']
    const {
        name,
        region,
        replicas,
        instanceType,
        instances,
        instanceSize,
        billingModel,
        maxPrice
    } = req.body

    try {
        await res.json(
            await utils.createMachineSet(
                namespace,
                name,
                region,
                replicas,
                instanceType,
                instances,
                instanceSize,
                billingModel,
                maxPrice,
            )
        )
    } catch (e) {
        next(e)
    }
}

module.exports = router