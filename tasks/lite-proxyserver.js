"use strict"
const _     = require("lodash");
const path  = require("path");
const Ducky = require("ducky");

module.exports = function (grunt) {

    grunt.loadNpmTasks('grunt-contrib-connect')
    grunt.loadNpmTasks('grunt-connect-proxy')
    grunt.loadNpmTasks('grunt-exec')
    grunt.loadNpmTasks('grunt-extend-config')

    const modulename = "[lite-proxyserver]";
    const configfile = grunt.option('package.json') || "package.json";
    const pkg        = grunt.file.readJSON(configfile);
    const liteCfg    = pkg["lite-proxyserver"];

    /* connect, server, proxy and watch specific actions and tasks */
    let rests = [];

    let errors = []
    if (!Ducky.validate(liteCfg, `{
                mock?:      [{
                    enabled?:               boolean,
                    ctx?:                   string,
                    fallback?:              string,
                    file:                   string
                }*],
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
    const mockCfgs = liteCfg ? liteCfg.mock : undefined;
    let mockFiles = [];
    let rest;
    _.forEach(mockCfgs, function(mockCfg) {
        if (mockCfg && mockCfg.enabled !== false) {
            const mockctx  = mockCfg.ctx || "/mock";
            const mockFile = path.join(process.cwd(), mockCfg.file)
            mockFiles.push(mockFile)
            try {
                rest = require(mockFile)(mockctx)
                rests.push({rest: rest, ctx: mockctx, file: mockFile, fallback: mockCfg.fallback});
            } catch (e) {
                grunt.fatal(modulename + " mock - handling lite-proxyserver.mock.file encounters a problem (" + e.message + ")")
            }
        }
        grunt.verbose.writeln(modulename + " mock " + (rest ? "enabled" : "disabled"));
    })

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
            exec: {
                httpServer: {
                    cmd: function() {
                        let watch = `./node_modules/nodemon/bin/nodemon --watch ${configfile}`
                        if (mockFiles && mockFiles.length) {
                            watch += _.chain(mockFiles)
                                .map(function(mockFile) { return ` --watch ${path.dirname(mockFile)}` })
                                .uniq()
                                .value()
                                .join("")
                        }
                        return `node ${watch} ./node_modules/grunt/bin/grunt configureProxies connect:httpServer`
                    },
                    options: {
                        stdio: 'inherit'
                    }
                }
            },
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
                            if (rests && rests.length) {
                                _.forEach(rests, function(restObj) {
                                    middlewares.push(restObj.rest.rester());
                                    grunt.log.writeln("Mock created for: " + restObj.ctx + " to " + restObj.file);
                                    if (restObj.fallback) {
                                        grunt.log.writeln(" is fallback for: " + restObj.fallback)
                                    }
                                })
                            }
                            middlewares.push(function mockFallbackHandler (req, res, next) {
                                let fallbackRest = _.chain(rests)
                                    .filter(function(rest) {
                                        return rest.fallback && req.url.startsWith(rest.fallback) && !req.url.startsWith(rest.ctx)
                                    })
                                    .first()
                                    .value()

                                if (fallbackRest) {
                                    res.statusCode = 302;
                                    const redirectTarget = req.url.replace(fallbackRest.fallback, fallbackRest.ctx);
                                    res.setHeader("location", redirectTarget);
                                    grunt.log.writeln("Fallback mock handler: redirecting to " + redirectTarget)
                                    res.end()
                                } else {
                                    next()
                                }
                            });
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

    grunt.registerTask("lite-proxyserver", ["configureProxies", "exec:httpServer"]);

}
