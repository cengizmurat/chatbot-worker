const express = require('express')

const utils = require('../utils')

const router = express.Router({
  mergeParams: true,
})

router.get('/', getInstances)
router.get('/:name', getInstance)
router.get('/namespaces/:namespace', getNamespaceInstances)

router.post('/namespaces/:namespace', createInstance)
router.put('/:name', updateInstance)
router.delete('/:name', deleteInstance)

const regex = /\*\/\d+|\d{1,2}|\*/gm
function checkCron(cron) {
  for (const c of cron.split(' ')) {
    const match = c.match(regex)
    if (match === null || match[0] !== c) return false
  }
  return true
}

async function getInstances(req, res, next) {
  try {
    await res.json(await utils.getHypnosInstances())
  } catch (e) {
    next(e)
  }
}

async function getInstance(req, res, next) {
  const name = req.params['name']

  try {
    await res.json(await utils.getHypnosInstance(name))
  } catch (e) {
    next(e)
  }
}

async function namespaceInstances(namespace) {
  const instances = await utils.getHypnosInstances()
  return instances.filter(instance => instance.metadata.labels && instance.metadata.labels.namespace === namespace)
}

async function getNamespaceInstances(req, res, next) {
  const namespace = req.params['namespace']

  try {
    await res.json(await namespaceInstances(namespace))
  } catch (e) {
    next(e)
  }
}

async function createInstance(req, res, next) {
  const namespace = req.params['namespace']
  const { wakeupCron, sleepCron } = req.body

  if (wakeupCron === undefined) {
    next(new Error('Missing parameter "wakeupCron"'))
  } else if (sleepCron === undefined) {
    next(new Error('Missing parameter "sleepCron"'))
  } else if (!checkCron(wakeupCron)) {
    next(new Error('Parameter "wakeupCron" is not a valid unix cron'))
  } else if (!checkCron(sleepCron)) {
    next(new Error('Parameter "sleepCron" is not a valid unix cron'))
  } else {
    try {
      const instances = await namespaceInstances(namespace)
      const name = `${namespace}-${instances.length + 1}`
      const instance = await utils.createHypnosInstance(namespace, name, wakeupCron, sleepCron)
      await res.json(instance)
    } catch (e) {
      next(e)
    }
  }
}

async function updateInstance(req, res, next) {
  const name = req.params['name']
  const { wakeupCron, sleepCron } = req.body

  if (wakeupCron === undefined) {
    next(new Error('Missing parameter "wakeupCron"'))
  } else if (sleepCron === undefined) {
    next(new Error('Missing parameter "sleepCron"'))
  } else if (!checkCron(wakeupCron)) {
    next(new Error('Parameter "wakeupCron" is not a valid unix cron'))
  } else if (!checkCron(sleepCron)) {
    next(new Error('Parameter "sleepCron" is not a valid unix cron'))
  } else {
    try {
      await res.json(await utils.updateHypnosInstance(name, wakeupCron, sleepCron))
    } catch (e) {
      next(e)
    }
  }
}

async function deleteInstance(req, res, next) {
  const name = req.params['name']

  try {
    await res.json(await utils.deleteHypnosInstance(name))
  } catch (e) {
    next(e)
  }
}

module.exports = router