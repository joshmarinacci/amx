var paths = require('path');
var fs    = require('fs');

var PROCS;
var root;
var config;
exports.initSetup = function() {
    if(!process.env.HOME) throw new Error("can't calculate HOME");
    var HOME = process.env.HOME;
    root = paths.join(HOME,'.amx');
    if(!fs.existsSync(root)) fs.mkdirSync(root);
    PROCS = paths.join(root,'procs');
    if(!fs.existsSync(PROCS)) fs.mkdirSync(PROCS);

    var file = paths.join(root,'config.json');
    if(!fs.existsSync(file)) {
        config = { }
    } else {
        config = JSON.parse(fs.readFileSync(file).toString());
    }
};
exports.getConfigDir = function() {
    return PROCS;
};
exports.getRootDir = function() {
    return root;
};

exports.getConfig = function() {
    return config;
};


exports.PORT = 48999;
