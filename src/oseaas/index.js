const express = require('express')

const config = require('../../config.js')
const utils = require('./utils')
const logger = require('../logger')

const router = express.Router()
const clusterName = config.CLUSTER_NAME

const pollingRate = 1000 // in milliseconds

router.get('/operations/:operationId', getOperation)

router.post('/projects', createProject)
router.get('/projects', getProjects)
router.delete('/projects/:project', deleteProject)

router.get('/projects/:project/rolebindings', getRoleBindings)
router.post('/projects/:project/rolebindings', addUserToProject)
router.delete('/projects/:project/rolebindings/:username/:role', removeUserRoleFromProject)
router.delete('/projects/:project/rolebindings/:username', removeUserFromProject)

const onGoingOperations = {}

async function getOperation(req, res, next) {
    try {
        const operationId = req.params['operationId']
        let operation = onGoingOperations[operationId]
        if (operation !== undefined) {
            if (operation === 'running') {
                operation = await utils.operationResult(operationId)
                await res.json(operation)
            } else if (operation.code && operation.body) {
                res.status(operation.code)
                await res.json(operation.body)
            } else {
                req.params['operationId'] = operation
                await getOperation(req, res, next)
            }
        } else {
            res.status(404)
            await res.json({message: 'Operation not found'})
        }
    } catch (e) {
        next(e)
    }
}

async function createProject(req, res, next) {
    const {project, username} = req.body
    const role = 'edit'
    logger.log(`Project creation "${project}" requested by ${username}`, 'INFO')

    try {
        const projectResponse = await utils.createProject(clusterName, project)
        await res.json(projectResponse) // return response to user, but continue actions

        const intervalID1 = setInterval(async function() {
            const result = await utils.operationResult(projectResponse.operation_id)
            const operation = result.operation
            if (operation) {
                onGoingOperations[projectResponse.operation_id] = 'running'
                if (operation.state !== 'running') {
                    clearInterval(intervalID1)
                    const postProject = result.details[`post_project_${clusterName}`]
                    const bodyProject = postProject.body
                    if (operation.state === 'success') {
                        if (postProject.code.toString().startsWith('2')) {
                            logger.log(`Created project "${bodyProject.metadata.name}" in cluster ${clusterName}`, 'INFO')
                            const response = await utils.addRoleBinding(clusterName, bodyProject.metadata.name, username, role)
                            onGoingOperations[response.operation_id] = 'running'
                            onGoingOperations[projectResponse.operation_id] = response.operation_id
                            const intervalID2 = setInterval(async function() {
                                const postRoleBinding = await utils.updateRoleBindingResult(response.operation_id, `post_rolebinding_${clusterName}`, username, role)
                                if (postRoleBinding) {
                                    if (postRoleBinding.code.toString().startsWith('2')) {
                                        logger.log(`Added role ${role} to ${username} in project "${bodyProject.metadata.name}"`, 'INFO')
                                    } else {
                                        logger.log(`Failed adding role ${role} to ${username} in project "${bodyProject.metadata.name}"`, 'ERROR')
                                        logger.log(postRoleBinding, 'TRACE')
                                    }
                                    clearInterval(intervalID2)
                                    onGoingOperations[response.operation_id] = {
                                        code: postRoleBinding.code,
                                        body: postRoleBinding.body,
                                    }
                                }
                            }, pollingRate)
                        } else {
                            logger.log(`Failed creating project "${bodyProject.metadata.name}" in cluster ${clusterName}`, 'ERROR')
                            logger.log(postProject, 'TRACE')
                            onGoingOperations[projectResponse.operation_id] = {
                                code: postProject.code,
                                body: bodyProject,
                            }
                        }
                    } else {
                        throw new Error(result)
                    }
                }
            }
        }, pollingRate * 2)
    } catch (e) {
        next(e)
    }
}

async function getProjects(req, res, next) {
    const username = req.query['username']
    logger.log(`Searching projects of ${username}...`, 'INFO')

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

async function deleteProject(req, res, next) {
    const projectName = req.params['project']
    logger.log(`Project deletion "${projectName}" requested`, 'INFO')

    try {
        const response = await utils.deleteProject(clusterName, projectName)
        const intervalID = setInterval(async function() {
            const result = await utils.operationResult(response.operation_id)
            const operation = result.operation
            if (operation.state !== 'running') {
                clearInterval(intervalID)
                const details = result.details[`delete_project_${clusterName}`]
                if (details.code.toString().startsWith('2')) {
                    logger.log(`Deleted project "${projectName}"`, 'INFO')
                } else {
                    logger.log(`Error deleting project "${projectName}"`, 'ERROR')
                    logger.log(details, 'TRACE')
                }
                res.status(details.code)
                await res.json(details.body)
            }
        }, pollingRate)
    } catch (e) {
        next(e)
    }
}

async function getRoleBindings(req, res, next) {
    const projectName = req.params['project']
    logger.log(`Getting RoleBindings of project "${projectName}"...`, 'INFO')

    try {
        const response = await utils.getRoleBindings(clusterName, projectName)
        const intervalID = setInterval(async function() {
            const result = await utils.operationResult(response.operation_id)
            const operation = result.operation
            if (operation.state !== 'running') {
                clearInterval(intervalID)
                const details = result.details[`get_rolebindings_${clusterName}`]
                if (details.code.toString().startsWith('2')) {
                    logger.log(`Found RoleBindings of project "${projectName}"`, 'INFO')
                } else {
                    logger.log(`Error when getting RoleBindings of project "${projectName}"`, 'ERROR')
                    logger.log(details, 'TRACE')
                }
                res.status(details.code)
                await res.json(details.body)
            }
        }, pollingRate)
    } catch (e) {
        next(e)
    }
}

async function addUserToProject(req, res, next) {
    const projectName = req.params['project']
    const {role, username} = req.body

    try {
        const response = await utils.addRoleBinding(clusterName, projectName, username, role)
        const intervalID = setInterval(async function() {
            const postRoleBinding = await utils.updateRoleBindingResult(response.operation_id, `post_rolebinding_${clusterName}`, username, role)
            if (postRoleBinding) {
                clearInterval(intervalID)
                if (postRoleBinding.code.toString().startsWith('2')) {
                    logger.log(`Added role ${role} to user ${username} in project "${projectName}"`, 'INFO')
                } else {
                    logger.log(`Error when adding role ${role} to user ${username} in project "${projectName}"`, 'ERROR')
                    logger.log(postRoleBinding, 'TRACE')
                }
                res.status(postRoleBinding.code)
                await res.json(postRoleBinding.body)
            }
        }, pollingRate)
    } catch (e) {
        next(e)
    }
}

async function removeUserRoleFromProject(req, res, next) {
    const projectName = req.params['project']
    const username = req.params['username']
    const role = req.params['role']

    try {
        const response = await utils.deleteRoleBinding(clusterName, projectName, username, role)
        const intervalID = setInterval(async function() {
            const deleteRoleBinding = await utils.updateRoleBindingResult(response.operation_id, `delete_rolebinding_${clusterName}`, username, role)
            if (deleteRoleBinding) {
                clearInterval(intervalID)
                if (deleteRoleBinding.code.toString().startsWith('2')) {
                    logger.log(`Removed role ${role} from user ${username} in project "${projectName}"`, 'INFO')
                } else {
                    logger.log(`Error when removing role ${role} from user ${username} in project "${projectName}"`, 'ERROR')
                    logger.log(deleteRoleBinding, 'TRACE')
                }
                res.status(deleteRoleBinding.code)
                await res.json(deleteRoleBinding.body)
            }
        }, pollingRate)
    } catch (e) {
        next(e)
    }
}

async function removeUserFromProject(req, res, next) {
    const projectName = req.params['project']
    const username = req.params['username']
    logger.log(`Removing all roles from user ${username} in project "${projectName}"...`, 'INFO')

    try {
        const roles = await utils.getRoleBindings(clusterName, projectName)
        const intervalID1 = setInterval(async function() {
            const result = await utils.operationResult(roles.operation_id)
            const operation = result.operation
            if (operation.state !== 'running') {
                clearInterval(intervalID1)
                const details = result.details[`get_rolebindings_${clusterName}`]
                const roleBindingList = details.body
                if (operation.state === 'success') {
                    for (const roleBinding of roleBindingList.items) {
                        const isSubject = roleBinding.subjects.map(subject => subject.name).indexOf(username) !== -1
                        if (isSubject) {
                            roleBinding.userNames = roleBinding.userNames.filter(user => user !== username)
                            roleBinding.subjects = roleBinding.subjects.filter(subject => subject.name !== username)
                            await utils.deleteRoleBinding(clusterName, projectName, username, roleBinding.metadata.name)
                        }
                    }
                } else {
                    res.status(details.code)
                    logger.log(`Error when removing all roles from user ${username} in project "${projectName}"`, 'ERROR')
                    logger.log(details, 'TRACE')
                }
                await res.json(roleBindingList)
            }
        }, pollingRate)
    } catch (e) {
        next(e)
    }
}

module.exports = router