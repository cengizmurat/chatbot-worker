const express = require('express')

const utils = require('../utils')

const router = express.Router()

router.get('/', getResourceQuotas)
router.post('/', createResourceQuotas)

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

module.exports = router