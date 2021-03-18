const express = require('express')

const router = express.Router()

router.use('/buckets', require('./buckets'))

module.exports = router