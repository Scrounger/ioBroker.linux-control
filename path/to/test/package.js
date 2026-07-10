const iobrokerTesting = require('@iobroker/testing');
const path = require('path');

module.exports = function() {
  // Update dependencies to use the latest versions
  expect(iobrokerTesting).to.be.an('object');
  expect(path).to.be.an('object');
};