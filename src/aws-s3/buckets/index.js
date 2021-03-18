const express = require('express')

const config = require('../../config')
const utils = require('../utils')

const bucketPrefix = config.AWS_BUCKET_PREFIX
const router = express.Router({
  mergeParams: true,
})

router.get('/', listBuckets)
router.post('/:name', createBucket)
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
  const name = req.params['name']

  try {
    const bucketName = `${bucketPrefix}-${name}`
    const response = await utils.createBucket(bucketName)
    await res.json(response)
  } catch (e) {
    next(e)
  }
}

async function deleteInstance(req, res, next) {
  const name = req.params['name']

  try {
    const bucketName = `${bucketPrefix}-${name}`
    const response = await utils.deleteBucket(bucketName) 
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