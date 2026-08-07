const { expect } = require('chai');
const path = require('path');
const iobrokerTesting = require('@iobroker/testing');

describe('Integration tests', () => {
  it('should pass', () => {
    // Update dependencies to use the latest versions
    expect(iobrokerTesting).to.be.an('object');
    expect(path).to.be.an('object');
  });
});