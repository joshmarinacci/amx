var paths = require('path');
var fs    = require('fs');

var PROCS;
var root;
exports.initSetup = function() {
    if(!process.env.HOME) throw new Error("can't calculate HOME");
    var HOME = process.env.HOME;
    root = paths.join(HOME,'.amx');
    if(!fs.existsSync(root)) fs.mkdirSync(root);
    PROCS = paths.join(root,'procs');
    if(!fs.existsSync(PROCS)) fs.mkdirSync(PROCS);
};
exports.getConfigDir = function() {
    return PROCS;
};
exports.getRootDir = function() {
    return root;
};


exports.PORT = 48999;
