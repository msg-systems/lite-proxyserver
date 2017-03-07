"use strict"
const _     = require("lodash");
const path  = require("path");
const Ducky = require("ducky");

module.exports = function (grunt) {

    grunt.loadNpmTasks('grunt-contrib-connect')
    grunt.loadNpmTasks('grunt-connect-proxy')
    grunt.loadNpmTasks('grunt-extend-config')

    const modulename = "[lite-proxyserver]";
    const configfile = grunt.option('package.json') || "package.json";
    const pkg        = grunt.file.readJSON(configfile);
    const liteCfg    = pkg["lite-proxyserver"];

    /* connect, server, proxy and watch specific actions and tasks */
    let rest;

    let errors = []
    if (!Ducky.validate(liteCfg, `{
                mock?:      {
                    enabled?:               boolean,
                    ctx?:                   string,
                    file:                   string
                },
                proxy?:      {
                    enabled?:               boolean,
                    targetHosts:    {
                        @:              {
                            host:           string,
                            port:           number
                        }    
                    },
                    target:                 string,
                    port?:                  number,
                    host?:                  string,
                    https?:                 boolean,
                    base?:                  string,
                    redirectRootToApp?:     string,
                    proxyPassReverse?:      boolean,
                    proxies?:               [object*]
                }
            }`, errors)) {
        grunt.fatal(modulename + " configuration failures: \n" + errors.join("\n"));
    }

    // handle mock
    const mockCfg = liteCfg ? liteCfg.mock : undefined;
    if (mockCfg && mockCfg.enabled !== false) {
        const mockctx = mockCfg.ctx || "/mock";
        try {
            rest = require(path.join(process.cwd(), mockCfg.file))(mockctx);
        } catch (e) {
            grunt.fatal(modulename + " mock - handling lite-proxyserver.mock.file encounters a problem (" + e.message + ")")
        }
    }
    grunt.verbose.writeln(modulename + " mock " + (rest ? "enabled" : "disabled"));

    // handle proxy
    const proxyCfg = liteCfg ? liteCfg.proxy : undefined;
    if (proxyCfg && proxyCfg.enabled !== false) {
        const proxyMiddleware = require('grunt-connect-proxy/lib/utils').proxyRequest;
        const tamper          = require('tamper');

        const targetHosts = proxyCfg.targetHosts;
        const proxyTarget = targetHosts[proxyCfg.target];
        const localPort   = proxyCfg.port || 2345;
        const localHost   = (proxyCfg.https ? "https" : "http") + "://" + (proxyCfg.host || "localhost") + ":" + localPort;

        const proxies = [];
        if (_.isArray(proxyCfg.proxies)) {
            _.forEach(proxyCfg.proxies, function (each) {
                const proxyEntry  = _.cloneDeep(each);
                proxyEntry.host = proxyTarget.host;
                proxyEntry.port = proxyTarget.port;
                if (each.hasOwnProperty("hostRewrite")) {
                    if (each.hostRewrite) {
                        if (!proxyEntry.headers)
                            proxyEntry.headers = {};
                        if (_.isObject(proxyEntry.headers))
                            proxyEntry.headers.host = proxyTarget.host + ":" + proxyTarget.port
                    }
                    delete proxyEntry.hostRewrite
                }
                proxies.push(proxyEntry)
            })
        }

        grunt.extendConfig({
            connect: {
                httpServer: {
                    options: {
                        hostname:   "*",
                        port:       localPort,
                        base:       [proxyCfg.base || "htdocs"],
                        protocol:   proxyCfg.https ? "https" : "http",
                        keepalive:  true,
                        middleware: function (connect, options) {
                            const middlewares = [];

                            middlewares.push(connect.logger({ format: "dev" }));

                            if (proxyCfg.redirectRootToApp && typeof proxyCfg.redirectRootToApp === 'string') {
                                middlewares.push(function redirectToApp (req, res, next) {
                                    if (req.url === "/") {
                                        res.statusCode = 302;
                                        res.setHeader("location", proxyCfg.redirectRootToApp);
                                        res.end()
                                    } else {
                                        next();
                                    }
                                })
                            }
                            if (!_.isEmpty(proxies)) {
                                if (proxyCfg.proxyPassReverse !== false) {
                                    middlewares.push(function proxyPassReverse (req, res, next) {
                                        res.oldSetHeader = res.setHeader;
                                        res.setHeader    = function (name, value) {
                                            let passReverseValue = value;
                                            if (name && name.toLowerCase() === "location") {
                                                passReverseValue = passReverseValue.replace(new RegExp("http[s]?://" + proxyTarget.host + ":" + proxyTarget.port + "/", "gi"), localHost + "/");
                                                if (passReverseValue !== value) {
                                                    console.log("[proxyPassReverse] change redirect location", value, "->", passReverseValue)
                                                }
                                            }
                                            res.oldSetHeader(name, passReverseValue)
                                        };
                                        next();
                                    });
                                    middlewares.push(tamper(function (req, res) {
                                        if (proxyCfg.proxyPassReverse === false ||
                                            (res.getHeader('Content-Type') && typeof res.getHeader('Content-Type') === "string" &&
                                            res.getHeader('Content-Type').indexOf('text/html') === -1)) {
                                            return
                                        }
                                        return function (body) {
                                            return body.replace(new RegExp("http[s]?://" + proxyTarget.host + ":" + proxyTarget.port + "/", "gi"), localHost + "/")
                                        }
                                    }));
                                }
                                middlewares.push(proxyMiddleware);
                            }
                            middlewares.push(connect.static(options.base[0], { maxAge: 0, redirect: true }));
                            middlewares.push(connect.directory(options.base[0]));
                            middlewares.push(connect.bodyParser());
                            if (rest) {
                                middlewares.push(rest.rester());
                            }
                            middlewares.push(connect.errorHandler());

                            return middlewares;
                        }
                    }
                },
                proxies:    proxies
            }
        });
        grunt.verbose.writeln(modulename + " proxy enabled")
    } else {
        grunt.verbose.writeln(modulename + " proxy disabled")
    }

    grunt.registerTask("lite-proxyserver", ["configureProxies", "connect:httpServer"]);

}