const express = require('express')

const utils = require('../utils')

const router = express.Router({
    mergeParams: true,
})

router.get('/', getMachineSets)
router.post('/', createMachineSet)
router.get('/:name', getMachineSet)
router.delete('/:name', deleteMachineSet)

async function getMachineSets(req, res, next) {
    const namespace = 'openshift-machine-api'
    try {
        await res.json((await utils.getMachineSets(namespace)).items)
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

async function createMachineSet(req, res, next) {
    const {namespace, group, type, billing, replicas, size = 'c5.xlarge', maxPrice = 1} = req.body

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
        const machineSetType = `dw-${group}-${type}-${billing}`
        await res.json(await utils.createPatchedMachineSet(
            namespace,
            machineSetType,
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