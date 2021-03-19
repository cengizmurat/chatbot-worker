const express = require('express')

const utils = require('../utils.js')

const router = express.Router({
  mergeParams: true,
})

router.get('/', listBuckets)
router.post('/', createBucket)
router.delete('/:name', deleteBucket)

async function listBuckets(req, res, next) {
  try {
    const response = await utils.listBuckets()
    await res.json(response.Buckets)
  } catch (e) {
    next(e)
  }
}

async function createBucket(req, res, next) {
  const { name } = req.body

  if (name === undefined) {
    next(createError('Missing parameter "name"', 400))
  } else try {
    const response = await utils.createBucket(name)
    await res.json(response)
  } catch (e) {
    next(e)
  }
}

async function deleteBucket(req, res, next) {
  const name = req.params['name']

  try {
    const response = await utils.deleteBucket(name)
    await res.json(response)
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