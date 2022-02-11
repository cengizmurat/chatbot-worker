const express = require('express')

const router = express.Router()

router.use('/groups', require('./groups'))
router.use('/projects', require('./projects'))
router.use('/machinesets', require('./machinesets'))
router.use('/financial-monkey', require('./financial-monkey'))
router.use('/credentials-requests', require('./credentials-requests'))

module.exports = router