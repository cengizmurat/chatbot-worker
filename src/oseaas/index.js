const express = require('express')

const config = require('../../config.js')
const utils = require('./utils')

const router = express.Router()
const clusterName = config.CLUSTER_NAME

router.get('/projects', getProjects)

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
                }, 1000)
                intervals.push(intervalId)
            }

            const intervalID = setInterval(async function() {
                if (intervals.length === 0) {
                    clearInterval(intervalID)
                    await res.json(projects)
                }
            }, 500)
        } else {
            await res.json(projects)
        }
    } catch (e) {
        next(e)
    }
}

module.exports = router