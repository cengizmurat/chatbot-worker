const express = require('express')

const utils = require('../utils')

const router = express.Router({
  mergeParams: true,
})

router.get('/', getInstances)
router.get('/:name', getInstance)

router.post('/namespaces/:namespace', createInstance)
router.put('/:name', updateInstance)
router.delete('/:name', deleteInstance)

async function getInstances(req, res, next) {
  try {
    await res.json(await utils.getCredentialsRequestInstances())
  } catch (e) {
    next(e)
  }
}

async function getInstance(req, res, next) {
  const name = req.params['name']

  try {
    await res.json(await utils.getCredentialsRequestInstance(name))
  } catch (e) {
    next(e)
  }
}

async function createInstance(req, res, next) {
  const namespace = req.params['namespace']
  const { name } = req.body

  if (name === undefined) {
    next(createError('Missing parameter "name"', 400))
  } else {
    try {
      const instance = await utils.createCredentialsRequestInstance(namespace, name)
      await res.json(instance)
    } catch (e) {
      next(e)
    }
  }
}

async function deleteInstance(req, res, next) {
  const name = req.params['name']

  try {
    await res.json(await utils.deleteCredentialsRequestInstance(name))
  } catch (e) {
    next(e)
  }
}

function createError(message, code) {
  const error = new Error(message)
  error.response = {
    data: {
      message: message,
    },
    status: code,
  }
  return error
}

module.exports = router