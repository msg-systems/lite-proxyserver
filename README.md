# lite-proxyserver
Lightweight _development only_ node server that serves a web app, mock rest endpoints and allows proxy requests to real backends.

[![Dependency Status](https://david-dm.org/msg-systems/lite-proxyserver.svg)](https://david-dm.org/msg-systems/lite-proxyserver)
[![npm version](https://badge.fury.io/js/lite-proxyserver.svg)](http://badge.fury.io/js/lite-proxyserver)
[![Build Status](https://travis-ci.org/msg-systems/lite-proxyserver.svg?branch=master)](https://travis-ci.org/msg-systems/lite-proxyserver)

## Why

During SPA development you want to code and test your SPA as fast as possible. Long term deployment round trips are not desired 
by your developers. The need for a fast and independent development deployment encourages a lite-server. The node based server is 
running locally and serves the SPA contents (HTML, CSS, JS). Changes to our development files can be '[watch](https://github.com/gruntjs/grunt-contrib-watch)'ed additionally in order
to live update your coding changes to the server. 

During further development your team will encounter the need for REST endpoints. In a first step you want to mock those as easy as
possible. This lite-server enables you to use a REST middleware pointing to a specific REST service implementation based on [connect-rest](https://github.com/imrefazekas/connect-rest).

After covering SPA development and REST mock implementation you finally want to run your whole app in a real environment. When
you start deploying and testing your app in the runtime environment you still will encounter the need for local bugfixing against
a running environment. The local running lite-server now comes in and provides you a way to configure your node server to proxy
requests against any real backend environment. So the SPA content is provided from local node server and the SPA rest endpoint will
target the same local node server - but this one will proxy those requests to your target environment. This way you wont get any
[CORS](https://en.wikipedia.org/wiki/Cross-origin_resource_sharing) problems and you can dynamically switch the backend between a local
mock implementation, a colleagues implementation or a stable environment. 

## Architecture

The [lite-proxyserver](https://github.com/msg-systems/lite-proxyserver) depends on several modules. Most important dependency is [connect](https://github.com/gruntjs/grunt-contrib-connect). 
While you could build it also on other server implementations just like [express](https://expressjs.com/) or [hapi](https://hapijs.com/) we had to choose a specific server 
implementation early some years ago and came up with [connect](https://github.com/gruntjs/grunt-contrib-connect). We just rely on the ability 
to use server middlewares as easy as possible.

So based on the first dependency all further middlewares are [connect](https://github.com/gruntjs/grunt-contrib-connect) based.
We use [connect-rest](https://github.com/imrefazekas/connect-rest) for the local REST service implementation and [connect-proxy](https://github.com/drewzboto/grunt-connect-proxy).
A simple redirect middleware is handwritten. A proxyPassReverse functionality is provided for response headers handwritten and for html body content rewriting we are using [tamper](https://github.com/fgnass/tamper).

The following image should visualize the local [lite-proxyserver](https://github.com/msg-systems/lite-proxyserver) including all middlewares used.
![architecture execution view](https://github.com/msg-systems/lite-proxyserver/raw/master/doc/execution%20view.png)

As you should have noticed by now this module strongly depends on [grunt](https://github.com/gruntjs/grunt). The server integrates well in a grunt build process.

## Installation

The recommended installation method is a local NPM install for your project:

```bash
$ npm install lite-proxyserver --save-dev
```

Basically you simple add it as a devDependency into your projects package.json.

Inside your projects Gruntfile.js you can integrate the lite-proxyserver by this snippet

```js
module.exports = function (grunt) {
    grunt.loadNpmTasks("lite-proxyserver")
};
```
  
## Configuration

The configuration of the lite-proxyserver and all its features is done within the package.json of your project.
Alternatively a different configuration can be provided by setting the '--package.json' command line option.
```
grunt lite-proxyserver --package.json=packageTest.json
```

The entries in the package.json will be validated with [duckyjs](https://github.com/rse/ducky) using the following specification

```
{
    mock?:      ([{
            enabled?:           boolean,
            ctx?:               string,
            fallback?:          string,
            file:               string
        }*] | {
            enabled?:           boolean,
            ctx?:               string,
            fallback?:          string,
            file:               string
        }),
    proxy?:      {
        enabled?:               boolean,
        targetHosts:    {
            @:              {
                host:           string,
                port:           number
            }    
        },
        target:                 string,
        host?:                  string,
        port?:                  number,
        https?:                 boolean,
        base?:                  string,
        redirectRootToApp?:     string,
        proxyPassReverse?:      boolean,
        proxies?:               [object*]
    }
}
```

Since most of them have defaults or some are not self explaining see the following explainations:

| configuration entry | command line option | default | explanation |
| ------------------- | ------------------- | ------- | ----------- |
| mock | - | - | can be either one configuration object or be an array of those objects |
| mock.enabled | --mock.enabled | true | mock implementation is generally activated by defining a mock.file; this switch exists to disable the mocking without deleting the rest of the configuration |
| mock.ctx | --mock.ctx | '/mock' | the context for local REST services; mocked services must use a unique context beside the proxied services because this way the middlewares can seperate mock requests from proxy requests |
| mock.fallback | --mock.fallback | - | in case that a combination of mock and proxy are used it is often important to not proxy all request. Often you want to proxy some of the services and use mocks for the rest. The fallback redirects not proxied requests by redirecting them to the specific mock definition |
| mock.file | --mock.file | - | the mock file is a string pointing to the mock implementation. That implementation should require the [connect-rest](https://github.com/imrefazekas/connect-rest) middleware and export it as 'rest'; An example can be found in [uica-skeleton](https://github.com/msg-systems/uica-skeleton) |
| proxy.enabled | --proxy.enabled | true | proxy functionality is generally activated; this switch exists to disable the proxy without deleting the rest of the configuration |
| proxy.targetHosts | --proxy.targetHosts.{name}.host --proxy.targetHosts.{name}.port | - | in order to switch proxy targets fast you can define all your possible targets in this place. The @ enables you to give each target a specific name that can be used as a reference at proxy.target |
| proxy.target | --proxy.target | - | this chooses the concrete proxy target from the proxy.targetHosts list |
| proxy.host | --proxy.host | 'localhost' | this is the local node servers hostname. Your browser should be able to fetch your SPA from the defined proxy.host:proxy.port |
| proxy.port | --proxy.port | 2345 | this is the local node servers port. Your browser should be able to fetch your SPA from the defined proxy.host:proxy.port |
| proxy.https | --proxy.https | false | simple switch that determines the local node servers protocol. By default it uses http but it can be switched to https |
| proxy.base | --proxy.base | 'htdocs' | this is the document root directory for the static content your node server should deliver |
| proxy.redirectRootToApp | --proxy.redirectRootToApp | - | This switch enables a simple middleware that handles incoming requests to '/' by redirecting to a specific context. this is useful if your app is deployed under a long context and you want to shortcut the browser URL. |
| proxy.proxyPassReverse | --proxy.proxyPassReverse | true | This enables the proxy pass reverse functionality. It handles the rewriting of target proxy URLs in responses (headers and body) back to origin local URLs |
| proxy.proxies | - | - | This defines a list of proxy URLs that should result in a proxy request. Basically this is a list of [connect-proxy](https://github.com/drewzboto/grunt-connect-proxy) configuration objects with one addition: the attribute 'hostRewrite' will result in a dynamic replacement of the proxy request header attribute 'host' set to the local node servers host and port. | 

Command line options overwrite any options from the package.json configuration. Example for providing command line options.
```
grunt lite-proxyserver --proxy.port=4711 --proxy.https=true   
```

An integration and configuration example of the [lite-proxyserver](https://github.com/msg-systems/lite-proxyserver) can be found in the [uica-skeleton](https://github.com/msg-systems/uica-skeleton).

## License

Code released under the [MIT license](./LICENSE).
