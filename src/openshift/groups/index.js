const express = require('express')

const utils = require('../utils')

const router = express.Router({
    mergeParams: true,
})

router.get('/', getGroups)
router.post('/', createGroup)

router.get('/:name', getGroup)
router.delete('/:name', deleteGroup)
router.put('/:name', addUsersToGroup)

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

async function getGroup(req, res, next) {
    const name = req.params['name']
    try {
        await res.json(await utils.getGroup(name))
    } catch (e) {
        next(e)
    }
}

async function deleteGroup(req, res, next) {
    const name = req.params['name']
    try {
        await res.json(await utils.deleteGroup(name))
    } catch (e) {
        next(e)
    }
}

async function addUsersToGroup(req, res, next) {
    const name = req.params['name']
    const { users } = req.body

    if (users === undefined) {
        next(new Error('Missing parameter "users"'))
    } else if (Array.isArray(users)) {
        next(new Error('Parameter "users" should be a list of user names'))
    } else {
        try {
            const group = await utils.getGroup(name)
            group.users.concat(users)
            // only unique elements
            group.users = group.users.filter((value, index, array) => array.indexOf(value) === index)
            await res.json(await utils.updateGroup(name, group))
        } catch (e) {
            next(e)
        }
    }
}

module.exports = router