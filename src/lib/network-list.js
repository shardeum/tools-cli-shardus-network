const util = require('./util')

module.exports = async (reference) => {
    util.pm2List(reference)
}