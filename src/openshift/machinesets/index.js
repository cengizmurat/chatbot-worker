const express = require('express')

const utils = require('../utils')

const router = express.Router({
    mergeParams: true,
})

router.get('/', getMachineSets)
router.post('/', createMachineSet)
router.get('/:name', getMachineSet)
router.put('/:name', updateMachineSet)
router.delete('/:name', deleteMachineSet)

async function getMachineSets(req, res, next) {
    const namespace = 'openshift-machine-api'
    const group = req.query['group']

    try {
        await res.json((await utils.getMachineSets(namespace, group)).items)
    } catch (e) {
        next(e)
    }
}

async function getMachineSet(req, res, next) {
    const namespace = 'openshift-machine-api'
    const name = req.params['name']
    try {
        await res.json(await utils.getMachineSet(namespace, name))
    } catch (e) {
        next(e)
    }
}

async function updateMachineSet(req, res, next) {
    const namespace = 'openshift-machine-api'
    const name = req.params['name']
    const body = req.body

    try {
        const replicas = body.spec.replicas
        body.spec.replicas = 0 // kill all previous Machines
        const machineSet = await utils.updateMachineSet(namespace, name, body)
        machineSet.spec.replicas = replicas
        delete machineSet.status
        await res.json(await utils.updateMachineSet(namespace, name, machineSet))
    } catch (e) {
        next(e)
    }
}

async function createMachineSet(req, res, next) {
    const {namespace, group, type, billing, replicas, size = 'c5.xlarge', maxPrice = 1} = req.body

    if (namespace === undefined) {
        next(new Error('Missing parameter "namespace"'))
    } else if (group === undefined) {
        next(new Error('Missing parameter "group"'))
    } else if (type === undefined) {
        next(new Error('Missing parameter "type"'))
    } else if (billing === undefined) {
        next(new Error('Missing parameter "billing"'))
    } else if (replicas === undefined) {
        next(new Error('Missing parameter "replicas"'))
    } else if (type !== 'gp' && type !== 'gpu') {
        next(new Error('Parameter "type" should be "gp" (general-purpose) or "gpu" (GPU)'))
    } else if (billing !== 'od' && billing !== 'sp') {
        next(new Error('Parameter "type" should be "od" (on-demand) or "sp" (spot)'))
    } else if (!isNumeric(replicas)) {
        next(new Error('Parameter "replicas" should be a positive integer'))
    } else {
        await res.json(await utils.createPatchedMachineSet(
            namespace,
            group,
            type,
            billing,
            parseInt(replicas),
            size,
            maxPrice,
        ))
    }
}

async function deleteMachineSet(req, res, next) {
    const namespace = 'openshift-machine-api'
    const name = req.params['name']
    try {
        await res.json(await utils.deleteMachineSet(namespace, name))
    } catch (e) {
        next(e)
    }
}

function isNumeric(value) {
    value = String(value)
    return /^(\d)+$/.test(value)
}

module.exports = router
