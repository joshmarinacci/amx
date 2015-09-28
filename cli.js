#!/usr/bin/env node
var common = require('./common');
var paths = require('path');
var http   = require('http');
var ch = require('child_process');
var fs = require('fs');

common.initSetup();

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
    if(tasks.length <= 0) {
        console.log("no running tasks");
        return;
    }
    tasks.forEach(function(task) {
        console.log("task " ,pad(task.name,20), task.running?'running':'stopped', task.pid);
    });
}

function listProcesses() {
    checkRunning(function() {
        var req = http.request({
            host:'localhost',
            port:common.PORT,
            method:'GET',
            path:'/list'},
            function(res) {
                var chunks = "";
                res.on('data',function(data) {
                    chunks += data.toString();
                });
                res.on('end', function() {
                    var obj = JSON.parse(chunks);
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
    console.log('starting the server ', __dirname);
    out = fs.openSync(__dirname+'/out.log', 'a'),
    err = fs.openSync(__dirname+'/out.log', 'a');
    var child = ch.spawn("node",[__dirname+'/server.js'],{detached:true, stdio:['ignore',out,err]});
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
};

function makeTask(args) {
    var taskname = args.shift();
    console.log("making the task",taskname);
    if(!taskname) return printUsage();
    var procpath = paths.join(common.getConfigDir(),taskname);
    if(!fs.existsSync(procpath)) fs.mkdirSync(procpath);
    console.log("made dir",procpath);
    var confpath = paths.join(procpath,'config.json');
    var config = JSON.parse(JSON.stringify(CONFIG_TEMPLATE));
    config.name = taskname;

    if(args.length > 0) {
        var script = args[0];
        config.script = script;
        config.directory = process.cwd();
    }
    console.log("generating ");
    console.log(JSON.stringify(config,null,'    '));
    fs.writeFileSync(confpath,JSON.stringify(config,null,'    '));

    console.log("edit the config file",confpath);
    console.log("then run amx start",taskname);
}

function doPost(path,cb) {
    checkRunning(function() {
        var req = http.request({
            host:'localhost',
            port:common.PORT,
            method:'POST',
            path:path},
            function(res) {
                var chunks = "";
                res.on('data',function(data) {
                    chunks += data.toString();
                });
                res.on('end', function() {
                    var obj = JSON.parse(chunks);
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

function restartTask(args) {
    var taskname = args[0];
    console.log("restarting the task",taskname);
    doPost("/restart?task="+taskname,function(e,res){
        // console.log("error = ",e);
        console.log("res = ", res);
    });
}

function recursiveDeleteDir(str) {
    if(fs.existsSync(str)) {
        if(fs.statSync(str).isDirectory()) {
            fs.readdirSync(str).forEach(function (file) {
                recursiveDeleteDir(paths.join(str, file));
            });
            fs.rmdirSync(str);
        } else {
            fs.unlinkSync(str);
        }
    }
}

function removeTask(args) {
    var taskname = args[0];
    console.log("removing the task",taskname);
    doPost("/stop?task="+taskname,function(e,res){
        console.log("res = ", res);
        console.log("now to delete it");
        recursiveDeleteDir(paths.join(common.getConfigDir(),taskname));
        console.log("done");
    });
}

function logTask(args) {
    var taskname = args[0];
    fs.createReadStream(paths.join(common.getConfigDir(),taskname,'stdout.log')).pipe(process.stdout);
}

var commands = {
    'list': listProcesses,
    'stopserver':stopServer,
    'make':makeTask,
    'start':startTask,
    'stop':stopTask,
    'restart':restartTask,
    'remove':removeTask,
    'log':logTask
};

runCommand();
