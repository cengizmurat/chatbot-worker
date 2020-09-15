const express = require('express')

const router = express.Router()

router.use('/groups', require('./groups'))
router.use('/projects', require('./projects'))

module.exports = router