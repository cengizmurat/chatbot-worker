const ldap = require('simple-ldap-search')

const config = require('../../config.js')
const logger = require('../logger.js')

const ldapConfig = {
    url: config.LDAP_URL,
    base: config.LDAP_BASE,
    dn: config.LDAP_DN,
    password: config.LDAP_PASSWORD,
}

const client = new ldap.default(ldapConfig)

const attributes = [
    'uid',
    'sggroupid',
    'sgzoneid',
]

async function search(filters) {
    const filter = Object.entries(filters).map(entry => entry.join('=')).join(',')
    logger.log(`LDAP Search : ${filter}`, 'TRACE')

    const users = await client.search(`(${filter})`, attributes)
    logger.log(users, 'TRACE')

    return users
}

module.exports = {
    search,
}