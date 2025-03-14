const express = require('express');
const fs = require('fs');
const path = require('path');
const landingTemplate = require('stremio-addon-sdk/src/landingTemplate');
const getRouter = require('stremio-addon-sdk/src/getRouter');
const opn = require('opn');
const requestIp = require('request-ip');
const qs = require('qs');
const { track } = require('../analytics');
const { addonEnabled } = require('../catalog');

function serveHTTP(addonInterface, opts = {}) {
    if (addonInterface.constructor.name !== 'AddonInterface') {
        throw new Error('first argument must be an instance of AddonInterface');
    }
    const app = express();

    const router = getRouter(addonInterface);
    app.use('/:resource/:type/:id/:extra?.json', (req, res, next) => {
        const { resource, type, id } = req.params;
        if (addonEnabled(id)) {
            const extra = req.params.extra ? qs.parse(req.params.extra) : {};
            const clientIp = requestIp.getClientIp(req);
            const properties = {
                id,
                clientIp,
                extra,
                resource,
                type,
            };
            track(resource, properties);
        }
        if (opts.cache) res.setHeader('cache-control', 'max-age=' + opts.cache);
        next();
    });
    app.use(router);

    // serve static dir
    if (opts.static) {
        const location = path.join(process.cwd(), opts.static);
        if (!fs.existsSync(location))
            throw new Error('directory to serve does not exist');
        app.use(opts.static, express.static(location));
    }

    // landing page
    const landingHTML = landingTemplate(addonInterface.manifest);
    app.get('/', (_, res) => {
        res.setHeader('content-type', 'text/html');
        res.end(landingHTML);
    });

    // const server = app.listen(opts.port);
    const server = app.listen(opts.port, "0.0.0.0");
    return new Promise(function(resolve, reject) {
        server.on('listening', function() {
            const url = `http://127.0.0.1:${server.address().port}/manifest.json`;
            console.log('HTTP addon accessible at:', url);
            if (process.argv.includes('--launch')) {
                const base = 'https://staging.strem.io#';
                //const base = 'https://app.strem.io/shell-v4.4#'
                const installUrl = `${base}?addonOpen=${encodeURIComponent(url)}`;
                opn(installUrl);
            }
            if (process.argv.includes('--install')) {
                opn(url.replace('http://', 'stremio://'));
            }
            resolve({ url, server });
        });
        server.on('error', reject);
    });
}

module.exports = serveHTTP;
