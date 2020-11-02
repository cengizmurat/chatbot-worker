const express = require('express')

const utils = require('../utils')

const router = express.Router({
    mergeParams: true,
})

router.post('/', createProject)
router.get('/', getProjects)
router.delete('/:project', deleteProject)

router.use('/:project/resourcequotas', require('./resourcequotas'))
router.use('/:project/rolebindings', require('./rolebindings'))

async function createProject(req, res, next) {
    const {project, username, machineSet} = req.body

    if (project === undefined) {
        next(new Error('Missing parameter "project"'))
    } else if (username === undefined) {
        next(new Error('Missing parameter "username"'))
    } else if (machineSet === undefined) {
        next(new Error('Missing parameter "machineSet"'))
    } else try {
        const {namespace, group, type, billing, replicas, size = 'c5.xlarge', maxPrice = 1} = machineSet
        
        if (namespace === undefined) {
            next(new Error('Missing parameter "namespace" in machineSet definition'))
        } else if (group === undefined) {
            next(new Error('Missing parameter "group" in machineSet definition'))
        } else if (type === undefined) {
            next(new Error('Missing parameter "type" in machineSet definition'))
        } else if (billing === undefined) {
            next(new Error('Missing parameter "billing" in machineSet definition'))
        } else if (replicas === undefined) {
            next(new Error('Missing parameter "replicas" in machineSet definition'))
        } else if (type !== 'gp' && type !== 'gpu') {
            next(new Error('Parameter "type" in machineSet definition should be "gp" (general-purpose) or "gpu" (GPU)'))
        } else if (billing !== 'od' && billing !== 'sp') {
            next(new Error('Parameter "type" in machineSet definition should be "od" (on-demand) or "sp" (spot)'))
        } else if (!isNumeric(replicas)) {
            next(new Error('Parameter "replicas" in machineSet definition should be a positive integer'))
        } else {
            await utils.createPatchedMachineSet(
                namespace,
                group,
                type,
                billing,
                parseInt(replicas),
                size,
                maxPrice,
            )
            const projectObj = await utils.createProjectRequest(project)
            await utils.updateProjectAnnotations(projectObj, username, [`dw-${group}-${type}-${billing}`])
            const projectName = projectObj.metadata.name
            await utils.updateProjectQuotas(projectName, 'small') // default project quota size
            await createDefaultHypnos(namespace)
            await utils.addUserToRolebinding(projectName, 'subadmin', username, 'User')
            await res.json(await utils.getProject(projectName))
        }
    } catch (e) {
        next(e)
    }
}

async function createDefaultHypnos(namespace) {
    const hypnosInstances = (await utils.getHypnosInstances()).filter(instance => instance.metadata.labels && instance.metadata.labels.namespace === namespace)
    const name = `${namespace}-${hypnosInstances.length + 1}`
    const label = 'io.shyrka.erebus/hypnos'
    const spec = {
        targetedLabel: `${label}=${name}-workload`,
        namespaceTargetedLabel: `${label}=${name}-namespace`,
        "cron-type": 'unix',
        "wakeup-cron": '0 9 * * *',
        "sleep-cron": '0 19 * * *',
        comments: 'Generated from Bot',
        resourceType: [
            'Deployment',
            'HorizontalPodAutoscaler',
            'StatefulSet',
        ],
    }
    return await utils.createHypnosInstance(namespace, name, spec)
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

function isNumeric(value) {
    value = String(value)
    return /^(\d)+$/.test(value)
}

module.exports = router