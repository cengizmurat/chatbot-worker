const express = require('express')

const router = express.Router()

router.use('/groups', require('./groups'))
router.use('/projects', require('./projects'))
router.use('/machinesets', require('./machinesets'))

module.exports = router