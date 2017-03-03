var _ = require("lodash");
var path = require("path");

module.exports = function (grunt) {
    var modulename = "[lite-proxyserver]";
    var configfile = "package.json";
    var pkg        = grunt.file.readJSON(configfile);
    var liteCfg    = pkg["lite-proxyserver"];

    /* connect, server, proxy and watch specific actions and tasks */
    var rest;
    // handle mock
    var mockCfg = liteCfg ? liteCfg.mock : undefined;
    if (mockCfg && mockCfg.enabled !== false) {
        var mockctx = mockCfg.ctx || "/mock";
        if (!mockCfg.file || typeof mockCfg.file !== "string")
            grunt.fatal(modulename + " configuration failure - lite-proxyserver.mock.file is not defined in " + configfile);
        else if (typeof mockCfg.file !== "string")
            grunt.fatal(modulename + " configuration failure - lite-proxyserver.mock.file is not a string");
        else {
            try {
                rest = require(path.join(__dirname, mockCfg.file))(mockctx);
            } catch (e) {
                grunt.fatal(modulename + " mock - handling lite-proxyserver.mock.file encounters a problem (" + e.message + ")")
            }
        }
    }
    grunt.verbose.writeln(modulename + " mock " + (rest ? "enabled" : "disabled"));

    // handle proxy
    var proxyCfg = liteCfg ? liteCfg.proxy : undefined;
    if (proxyCfg && proxyCfg.enabled !== false) {
        var proxyMiddleware = require('grunt-connect-proxy/lib/utils').proxyRequest;
        var tamper          = require('tamper');

        var targetHosts = proxyCfg.targetHosts;
        var proxyTarget = targetHosts[proxyCfg.target];
        var localPort   = proxyCfg.port || 2345;
        var localHost   = (proxyCfg.https ? "https" : "http") + "://" + (proxyCfg.host || "localhost") + ":" + localPort;

        var proxies = [];
        if (_.isArray(proxyCfg.proxies)) {
            _.forEach(proxyCfg.proxies, function (each) {
                var proxyEntry  = _.cloneDeep(each);
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
                            var middlewares = [];

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
                                            var passReverseValue = value;
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

    grunt.registerTask("proxyServer", ["configureProxies", "connect:httpServer"]);

}
