const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const sinonChai = require('sinon-chai');

chai.use(chaiAsPromised);
chai.use(sinonChai);

module.exports = function() {
  // Update dependencies to use the latest versions
  chai.should();
  chai.expect();
};