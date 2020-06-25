const ldap = require('simple-ldap-search')

const config = require('../../config.js')

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

async function search(uid) {
    return await client.search(`(uid=${uid})`, attributes)
}

module.exports = {
    search,
}