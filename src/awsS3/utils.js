const AWS = require('aws-sdk');

const config = require('../../config.js');
const logger = require('../logger');

const bucketPrefix = config.AWS_BUCKET_PREFIX

// Create S3 service object
const s3 = new AWS.S3({
    region: config.AWS_REGION,
    credentials: {
        accessKeyId: config.AWS_ACCESS_KEY_ID,
        secretAccessKey: config.AWS_SECRET_ACCESS_KEY,
    },
});

async function listBuckets(namespace) {
    const promise = new Promise(function(resolve, reject) {
        logger.log(`[AWS S3] List Buckets`, 'TRACE')
        s3.listBuckets(function(err, data) {
            if (err) {
                logger.log(err, 'ERROR')
                reject(err);
            } else {
                data.Buckets = data.Buckets.filter(bucket => bucket.Name.indexOf(`${bucketPrefix}-${namespace}`) === 0)
                resolve(data);
            }
        });
    })

    return await promise;
}

async function createBucket(namespace, name) {
    const fullName = `${bucketPrefix}-${namespace}-${name}`;
    const params = {
        Bucket: fullName,
    };

    const promise = new Promise(function(resolve, reject) {
        logger.log(`[AWS S3] Create Bucket ${fullName}`, 'TRACE')
        s3.createBucket(params, function(err, data) {
            if (err) {
                logger.log(err, 'ERROR')
                reject(err);
            } else {
                resolve(data);
            }
        });
    });

    return await promise;
}

async function deleteBucket(namespace, name) {
    const fullName = `${bucketPrefix}-${namespace}-${name}`;
    const params = {
        Bucket: fullName,
    };

    const promise = new Promise(function(resolve, reject) {
        logger.log(`[AWS S3] Delete Bucket ${fullName}`, 'TRACE')
        s3.deleteBucket(params, function(err, data) {
            if (err) {
                logger.log(err, 'ERROR')
                reject(err);
            } else {
                resolve(data);
            }
        });
    });

    return await promise;
}

module.exports = {
    listBuckets,
    createBucket,
    deleteBucket,
}