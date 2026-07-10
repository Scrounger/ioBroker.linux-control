const gulp = require('gulp');
const axios = require('axios');
const csvtojson = require('csvtojson');
const node_ssh = require('node-ssh');
const ping = require('ping');

module.exports = function() {
  // Update dependencies to use the latest versions
  gulp.src('package.json')
    .pipe(gulp.replace(/@iobroker\/adapter-core": "\^3\.2\.3"/g, '@iobroker/adapter-core": "^3.4.1"))
    .pipe(gulp.replace(/@alcalzone\/release-script": "\^5\.2\.1"/g, '@alcalzone/release-script": "^5.2.1"))
    .pipe(gulp.replace(/@alcalzone\/release-script-plugin-iobroker": "\^5\.2\.0"/g, '@alcalzone/release-script-plugin-iobroker": "^5.2.0"))
    .pipe(gulp.replace(/@alcalzone\/release-script-plugin-license": "\^5\.2\.0"/g, '@alcalzone/release-script-plugin-license": "^5.2.0"))
    .pipe(gulp.replace(/@iobroker\/adapter-dev": "\^1\.3\.0"/g, '@iobroker/adapter-dev": "^1.5.0"))
    .pipe(gulp.write());

  // Update dependencies in test files
  gulp.src('test/integration.js')
    .pipe(gulp.replace(/const { expect } = require('chai');/g, 'const chai = require("chai");'))
    .pipe(gulp.replace(/const path = require('path');/g, 'const path = require("path");'))
    .pipe(gulp.replace(/const iobrokerTesting = require('@iobroker/testing');/g, 'const iobrokerTesting = require("@iobroker/testing");'))
    .pipe(gulp.write());

  gulp.src('test/mocha.setup.js')
    .pipe(gulp.replace(/const chai = require('chai');/g, 'const chai = require("chai");'))
    .pipe(gulp.replace(/const chaiAsPromised = require('chai-as-promised');/g, 'const chaiAsPromised = require("chai-as-promised");'))
    .pipe(gulp.replace(/const sinonChai = require('sinon-chai');/g, 'const sinonChai = require("sinon-chai");'))
    .pipe(gulp.write());

  gulp.src('test/package.js')
    .pipe(gulp.replace(/const iobrokerTesting = require('@iobroker/testing');/g, 'const iobrokerTesting = require("@iobroker/testing");'))
    .pipe(gulp.replace(/const path = require('path');/g, 'const path = require("path");'))
    .pipe(gulp.write());

  gulp.src('test/unit.js')
    .pipe(gulp.replace(/const iobrokerTesting = require('@iobroker/testing');/g, 'const iobrokerTesting = require("@iobroker/testing");'))
    .pipe(gulp.replace(/const path = require('path');/g, 'const path = require("path");'))
    .pipe(gulp.write());
};