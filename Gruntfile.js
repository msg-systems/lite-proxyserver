/*
 **  lite-proxyserver
 **  Design and Development by msg Applied Technology Research
 **  Copyright (c) 2016 msg systems ag (http://www.msg.group/)
 */

var path = require("path");

module.exports = function (grunt) {

    grunt.loadNpmTasks('grunt-contrib-connect')
    grunt.loadNpmTasks('grunt-connect-proxy')
    grunt.loadNpmTasks('grunt-extend-config')

    grunt.loadTasks(path.join(__dirname, "grunt-config"))
};
