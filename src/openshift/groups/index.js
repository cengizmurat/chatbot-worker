const express = require('express')

const utils = require('../utils')

const router = express.Router({
    mergeParams: true,
})

router.get('/', getGroups)
router.post('/', createGroup)

async function getGroups(req, res, next) {
    const username = req.query['username']

    try {
        let groups = []
        if (username) {
            groups = await utils.getGroupsForUser(username)
        }

        await res.json(groups)
    } catch (e) {
        next(e)
    }
}

async function createGroup(req, res, next) {
    const { name, users = [] } = req.body

    if (name === undefined) {
        next(new Error('Missing parameter "name"'))
    } else if (!Array.isArray(users)) {
        next(new Error('Parameters "users" should be an array of username'))
    } else {
        await res.json(await utils.createGroup(name, users))
    }
}

module.exports = router