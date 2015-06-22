var common = require('./common');
var paths = require('path');
var http   = require('http');
var ch = require('child_process');
var fs = require('fs');
//validate info
//connect to the server
//print err if cant connect
//look for the server pid
//if not running, start the server
//send start/stop/list request


common.initSetup();

// console.log("dir = ", common.getConfigDir());
// console.log("fetching on port",common.PORT);

var args = process.argv.slice();
// console.log("args = ", args);
if(args.length < 3) return printUsage();
args.shift();
args.shift();

function runCommand() {
    var command = args.shift();
    // console.log("invoking command", command);

    if(commands[command]) {
        // console.log("doing the command");
        return commands[command](args);
    }
    console.log("returning back here");
    return printUsage();
}

function spaces(n) {
    var str = "";
    for(var i=0; i<n; i++) {
        str +=' ';
    }
    return str;
}
function pad(str,n) {
    if(!str) return spaces(n);
    if(str.length < n) return str + spaces(n-str.length);
    return str;
}
function printTasks(tasks) {
    tasks.forEach(function(task) {
        console.log("task " ,pad(task.name,20), task.running?'running':'stopped', task.pid);
    });
}

function listProcesses() {
    checkRunning(function() {
        console.log("invoking the list");
        var req = http.request({
            host:'localhost',
            port:common.PORT,
            method:'GET',
            path:'/list'},
            function(res) {
                //console.log("got list back", res.statusCode);
                //console.log("data = ")
                var chunks = "";
                res.on('data',function(data) {
                    //console.log("got some data " + data);
                    chunks += data.toString();
                });
                res.on('end', function() {
                    //console.log("got the end of the data");
                    var obj = JSON.parse(chunks);
                    console.log("response from /list = ", obj);
                    printTasks(obj.tasks);
                });
            }
        );
        req.on('error',function(e) {
            console.log("error",e);
        });
        req.end();
    });
}

function stopServer() {
    checkRunning(function() {
        console.log("invoking the stop server");
        var req = http.request({
            host:'localhost',
            port:common.PORT,
            method:'POST',
            path:'/stopserver'},
            function(res) {
                console.log("got stopserver back", res.statusCode);
                console.log("data = ")
                var chunks = "";
                res.on('data',function(data) {
                    console.log("got some data " + data);
                    chunks += data.toString();
                });
                res.on('end', function() {
                    console.log("got the end of the data");
                    var obj = JSON.parse(chunks);
                    console.log("response = ", obj);
                });
            }
        );
        req.on('error',function(e) {
            console.log("error",e);
        });
        req.end();
    });
}

function checkRunning(cb) {
    // console.log("invoking quick status test");
    var req = http.request({
        host:'localhost',
        port:common.PORT,
        method:'GET',
        path:'/status'},
        function(res){
            // console.log("status is",res.statusCode);
            cb();
        });
    req.on('error',function(e) {
        //console.log("error",e);
        if(e.code == 'ECONNREFUSED') {
            console.log("the server hasn't started yet");
            setTimeout(function() {
                console.log("the server should be started now");
                cb();
            },1000);
            return startServer();
        }
    });
    req.end();
}


function startServer() {
    console.log('starting the server');
    out = fs.openSync('./out.log', 'a'),
    err = fs.openSync('./out.log', 'a');
    var child = ch.spawn("node",['server.js'],{detached:true, stdio:['ignore',out,err]});
    child.unref();
}

function printUsage() {
    console.log("amx make  <taskname>");
    console.log("      make a new task")
    console.log("amx edit  <taskname>");
    console.log("amx start <taskname>");
    console.log("      start a task")
    console.log("amx stop  <taskname>");
    console.log("      stop a task")
    console.log("amx list");
    console.log("      list all tasks")
    console.log("amx stopserver");
    console.log("      stop the task server")
}


var CONFIG_TEMPLATE = {
    name:"unnamed task",
    directory:"directory of your files",
    type:'node',
    script:'myscript.js'
}

function makeTask(args) {
    var taskname = args[0];
    console.log("making the task",taskname);
    if(!taskname) return printUsage();
    var procpath = paths.join(common.getConfigDir(),taskname);
    if(!fs.existsSync(procpath)) fs.mkdirSync(procpath);
    console.log("made dir",procpath);
    var confpath = paths.join(procpath,'config.json');
    var config = JSON.parse(JSON.stringify(CONFIG_TEMPLATE));
    config.name = taskname;
    fs.writeFileSync(confpath,JSON.stringify(config,null,'    '));

    console.log("edit the config file",confpath);
    console.log("then run amx start",taskname);
}

function doPost(path,cb) {
    checkRunning(function() {
        // console.log("invoking the " + path);
        var req = http.request({
            host:'localhost',
            port:common.PORT,
            method:'POST',
            path:path},
            function(res) {
                // console.log("got start results", res.statusCode);
                // console.log("data = ")
                var chunks = "";
                res.on('data',function(data) {
                    // console.log("got some data " + data);
                    chunks += data.toString();
                });
                res.on('end', function() {
                    // console.log("got the end of the data");
                    var obj = JSON.parse(chunks);
                    // console.log("response = ", obj);
                    cb(null,obj);
                });
            }
        );
        req.on('error',function(e) {
            console.log("error",e);
            cb(e);
        });
        req.end();
    });
}

function startTask(args) {
    var taskname = args[0];
    console.log("starting the task",taskname);
    doPost("/start?task="+taskname, function(e,res) {
        // console.log("error = ",e);
        console.log("res = ", res);
    });
}

function stopTask(args) {
    var taskname = args[0];
    console.log("stopping the task",taskname);
    doPost("/stop?task="+taskname,function(e,res){
        // console.log("error = ",e);
        console.log("res = ", res);
    });
}

var commands = {
    'list': listProcesses,
    'stopserver':stopServer,
    'make':makeTask,
    'start':startTask,
    'stop':stopTask,
}

runCommand();
