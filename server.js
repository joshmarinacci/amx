var common = require('./common');
var paths = require('path');
var fs    = require('fs');
var http  = require('http');
var child_process = require('child_process');

console.log("my process is",process.pid);
console.log("starting on port", common.PORT);

function ERROR(res,str) {
    console.log("ERROR",str);
    res.statusCode = 500;
    res.setHeader('Content-Type','text/json');
    res.write(JSON.stringify({status:'error','message':str}));
    res.end();
}
function SUCCESS(res,str) {
    console.log("SUCCESS",str);
    res.statusCode = 200;
    res.setHeader('Content-Type','text/json');
    res.write(JSON.stringify({status:'success','message':str}));
    res.end();
}

common.initSetup();

function listProcesses(cb) {
    child_process.exec('ps ax -o pid=',function(err,stdout,stderr){
        var lines = stdout.split('\n');
        // console.log("got a process list",lines);
        lines = lines.map(function(line) {
            return parseInt(line);
        })
        lines = lines.filter(function(line) {
            return !isNaN(line);
        })
        // console.log("got a process list",lines);
        return cb(lines);
    });
}

function parseTaskName(req) {
    var parts = require('url').parse(req.url);
    var query = parts.query.split('=');
    var task = query[1];
    return task;
}

function taskExists(task) {
    var taskdir = paths.join(common.getConfigDir(),task);
    return fs.existsSync(taskdir)
}

function getTaskPid(task) {
    var pidfile = paths.join(common.getConfigDir(),task,'pid');
    if(!fs.existsSync(pidfile)) return -1;
    var pid = parseInt(fs.readFileSync(pidfile).toString());
    return pid;
}

var handlers = {
    '/status': function(req,res) {
        // console.log("handling status");
        res.statusCode = 200;
        res.setHeader('Content-Type','text/json');
        res.write(JSON.stringify({'status':'alive'}));
        res.end();
    },
    '/list': function(req,res) {
        listProcesses(function(pids){
            res.statusCode = 200;
            var list = fs.readdirSync(common.getConfigDir());
            res.setHeader('Content-Type','text/json');
            var tasks = list.map(function(name) {
                var running = false;
                var dir     = paths.join(common.getConfigDir(),name);
                var pid     = getTaskPid(name);
                if(pids.indexOf(pid)>=0) {
                    running = true;
                }
                return {
                    name:name,
                    path:dir,
                    running: running,
                    pid: pid
                }
            })
            res.write(JSON.stringify({'count':tasks.length,tasks:tasks}));
            res.end();
        });
    },
    '/stop': function(req,res) {
        var task = parseTaskName(req);
        if(!task) return ERROR(res,"no task specified");
        if(!taskExists(task)) return ERROR(res,"no such task " + task);

        var pid = getTaskPid(task);
        listProcesses(function(pids){
            if(pids.indexOf(pid)>=0) {
                try {
                    process.kill(pid,'SIGINT');
                    return SUCCESS(res,"successfully killed " + task);
                } catch(er) {
                    return ERROR(res,"error from killing " + er);
                }
            } else {
                return ERROR(res,"process not running");
            }
        });
    },
    '/start': function(req,res) {
        var task = parseTaskName(req);
        if(!task) return ERROR(res,"no task specified");
        if(!taskExists(task)) return ERROR(res,"no such task " + task);
        var pid = getTaskPid(task);
        listProcesses(function(pids){
            if(pids.indexOf(pid)>=0) {
                return ERROR(res,"task is already running: " + task + " " + pid)
            }

            var taskdir = paths.join(common.getConfigDir(),task);
            var config_file = paths.join(taskdir,'config.json');
            var config = JSON.parse(fs.readFileSync(config_file).toString());
            if(config.type != 'node') return ERROR(res,"unknown script type " + config.type);
            if(!fs.existsSync(config.directory)) return ERROR(res,"directory does not exist " + config.directory);

            var command = 'node';
            var cargs = [config.script];
            var stdout_log = paths.join(taskdir,'stdout.log');
            var stderr_log = paths.join(taskdir,'stderr.log');
            out = fs.openSync(stdout_log, 'a'),
            err = fs.openSync(stderr_log, 'a');
            var opts = {
                cwd:config.directory,
                detached:true,
                stdio:['ignore',out,err]
            }
            console.log("spawning",command,cargs,opts);
            var child = child_process.spawn(command, cargs, opts);
            var cpid = child.pid;
            fs.writeFileSync(paths.join(taskdir,'pid'),''+cpid);
            child.unref();
            SUCCESS(res,"started task " + task + ' ' + cpid);
        });

    },
    '/stopserver':function(req,res) {
        SUCCESS(res,"stopping the server");
        setTimeout(function(){ process.exit(-1); },100);
    }
}

http.createServer(function(req,res) {
    var parts = require('url').parse(req.url);
    console.log("parts = ", parts);
    if(handlers[parts.pathname]) return handlers[parts.pathname](req,res);
    console.log("no handler");

    res.statusCode = 200;
    res.setHeader('Content-Type','text/json');
    res.write(JSON.stringify({'status':'alive'}));
    res.end();
}).listen(common.PORT, function() {
    console.log("we are up and running");
})


return;
var PROCS = "";
var args = process.argv.slice();

args.shift();
args.shift();

if(args.length <= 0) return printUsage();


var command = args.shift();
if(command == 'make') {
    makeTask(args);
    return;
}
if(command == 'start') {
    startTask(args);
    return;
}

return printUsage();



function startTask(args) {
    var taskname = args[0];
    console.log("making the task",taskname);
    if(!taskname) return err("missing task name");

    initSetup();
    console.log("procs = ", PROCS);
    if(!fs.existsSync(paths.join(PROCS,taskname))) return err("no task found with the name " + taskname);

    var config_file = paths.join(PROCS,taskname,'config.json');
    var config = JSON.parse(fs.readFileSync(config_file).toString());
    console.log("loading",config);

    if(config.type != 'node') return err("unknown script type " + config.type);
    if(!fs.existsSync(config.directory)) return err("directory does not exist " + config.directory);

    var command = 'node';
    var cargs = [config.script];
    var opts = {
        cwd:config.directory
    }
    var stdout_log = paths.join(PROCS,taskname,'stdout.log');
    var stderr_log = paths.join(PROCS,taskname,'stderr.log');
    console.log('stdout going to ', stdout_log, stderr_log);
    console.log("spawning",command,cargs,opts);
    var ch = child_process.spawn(command, cargs, opts);
    ch.stdout.pipe(fs.createWriteStream(stdout_log));
    ch.stderr.pipe(fs.createWriteStream(stderr_log));
    ch.on('close', function(code) {
        console.log("child has closed",code);
    });

}
