const express = require('express')

const utils = require('../utils')

const router = express.Router()

router.get('/', getMachineSets)
router.post('/', createMachineSet)

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