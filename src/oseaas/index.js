const express = require('express')

const config = require('../../config.js')
const utils = require('./utils')

const router = express.Router()
const clusterName = config.CLUSTER_NAME

const pollingRate = 1000 // in milliseconds

router.post('/projects', createProject)
router.get('/projects', getProjects)
router.delete('/projects/:project', deleteProject)

//router.get('/projects/:project/rolebindings', getRoleBindings)
router.post('/projects/:project/rolebindings', addUserToProject)
//router.delete('/projects/:project/rolebindings/:username', removeUserFromProject)

async function createProject(req, res, next) {
    const {project, username} = req.body
    const role = 'edit'

    try {
        const projectResponse = await utils.createProject(clusterName, project)
        const intervalID1 = setInterval(async function() {
            const result = await utils.operationResult(projectResponse.operation_id)
            const operation = result.operation
            if (operation) {
                if (operation.state !== 'running') {
                    clearInterval(intervalID1)
                    const postProject = result.details[`post_project_${clusterName}`]
                    const bodyProject = postProject.body
                    if (operation.state === 'success') {
                        if (postProject.code.toString().startsWith('2')) {
                            const response = await utils.addRoleBinding(clusterName, bodyProject.metadata.name, username, role)
                            const intervalID2 = setInterval(async function() {
                                const postRoleBinding = await utils.addRoleBindingResult(response.operation_id, clusterName, username, role)
                                if (postRoleBinding) {
                                    clearInterval(intervalID2)
                                    res.status(postRoleBinding.code)
                                    await res.json(postRoleBinding.body)
                                }
                            }, pollingRate)
                        } else {
                            res.status(postProject.code)
                            await res.json(bodyProject)
                        }
                    } else {
                        throw new Error(result)
                    }
                }
            }
        }, pollingRate)
    } catch (e) {
        next(e)
    }
}

async function getProjects(req, res, next) {
    const username = req.query['username']

    try {
        const projects = []
        if (username) {
            const intervals = []
            const allProjects = await utils.getProjects(clusterName)
            for (const project of allProjects) {
                const rolebindingsOperation = await utils.getRoleBindings(clusterName, project)
                const intervalId = setInterval(async function() {
                    try {
                        let detailsFound = false
                        const operation = await utils.operationResult(rolebindingsOperation.operation_id)
                        if (operation.details) {
                            const details = operation.details[`get_rolebindings_${clusterName}`]
                            if (details) {
                                detailsFound = true
                                for (const rolebinding of details.body.items) {
                                    const roleMetadata = rolebinding.metadata
                                    const roleName = roleMetadata.name
                                    if (roleName === 'edit') {
                                        for (const subject of rolebinding.subjects) {
                                            if (subject.name === username) {
                                                projects.push(roleMetadata.namespace)
                                                break
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        if (detailsFound || operation.operation.state !== 'running') {
                            clearInterval(intervalId)
                            const index = intervals.indexOf(intervalId)
                            if (index > -1) {
                                intervals.splice(index, 1)
                            }
                        }
                    } catch (e) {
                        clearInterval(intervalID)
                        next(e)
                    }
                }, pollingRate)
                intervals.push(intervalId)
            }

            const intervalID = setInterval(async function() {
                if (intervals.length === 0) {
                    clearInterval(intervalID)
                    await res.json(projects)
                }
            }, pollingRate / 2)
        } else {
            await res.json(projects)
        }
    } catch (e) {
        next(e)
    }
}

// TODO
async function deleteProject(req, res, next) {
    const projectName = req.params['project']
}

// TODO
async function getRoleBindings(req, res, next) {
    const projectName = req.params['project']
}

// TODO
async function addUserToProject(req, res, next) {
    const projectName = req.params['project']
    const {role, username} = req.body

    try {
        const response = await utils.addRoleBinding(clusterName, projectName, username, role)
        const intervalID = setInterval(async function() {
            const postRoleBinding = await utils.addRoleBindingResult(response.operation_id, clusterName, username, role)
            if (postRoleBinding) {
                clearInterval(intervalID)
                res.status(postRoleBinding.code)
                await res.json(postRoleBinding.body)
            }
        }, pollingRate)
    } catch (e) {
        next(e)
    }
}

// TODO
async function removeUserFromProject(req, res, next) {
    const projectName = req.params['project']
    const username = req.params['username']
}

module.exports = router