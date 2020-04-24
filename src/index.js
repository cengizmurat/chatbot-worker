const express = require('express');
const bodyParser = require('body-parser');

const app = express();

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
    extended: true
}));

async function init() {
    app.use(cors);
    app.use('/', router);
    app.use(handleError);

    return app;
}

const router = express.Router();
router.get('/', homeUrl);
router.use('/openshift', require('./openshift'));

async function homeUrl(req, res, next) {
    res.statusCode = 200;
    await res.json({Status: 'Up'});
}

async function cors(req, res, next) {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
}

async function handleError(err, req, res, next) {
    const response = err.response
    if (response && response.data) {
        res.status(response.data.code)
        await res.json(response.data)
    } else {
        res.status(500)
        await res.json({reason: err.message})
    }
}

exports.init = init;
