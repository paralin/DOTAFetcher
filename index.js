/**
 * Serves as an entry point to services, based on the ROLE var
 */
if (process.env.NEW_RELIC_LICENSE_KEY) {
  require('newrelic');
}
var config = require('./config');
var role = config.ROLE;
console.log(role);
require("./" + role + ".js");
