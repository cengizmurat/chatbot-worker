const express = require('express')

const utils = require('../utils')

const router = express.Router()

router.get('/', getGroups)

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

module.exports = router