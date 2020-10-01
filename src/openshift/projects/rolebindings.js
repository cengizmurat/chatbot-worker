const express = require('express')

const utils = require('../utils')

const router = express.Router({
    mergeParams: true,
})

router.get('/', getRoleBindings)
router.post('/', addUserToProject)
router.delete('/:username/:role', removeUserRoleFromProject)
router.delete('/:username', removeUserFromProject)

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
    const { role, username, group } = req.body

    if (role === undefined) {
        next(new Error('Missing parameter "role"'))
    } else if (username === undefined && group === undefined) {
        next(new Error('Missing parameter "username" or "group"'))
    } else try {
        const response = await utils.addUserToRolebinding(projectName, role, username || group, username ? 'User' : 'Group')
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