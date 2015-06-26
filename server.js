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

function stopTask(task, cb) {
    var pid = getTaskPid(task);
    listProcesses(function(pids){
        if(pids.indexOf(pid)>=0) {
            try {
                process.kill(pid,'SIGINT');
                return cb(null);
            } catch(er) {
                return cb(er);
            }
        } else {
            return cb("process not running");
        }
    });
}

function getTaskConfig(task) {
    var taskdir = paths.join(common.getConfigDir(),task);
    var config_file = paths.join(taskdir,'config.json');
    var config = JSON.parse(fs.readFileSync(config_file).toString());
    return config;
}
function updateTask(task, cb) {
    var config = getTaskConfig(task);
    console.log("config = ", config);
    var out = child_process.execSync("git pull ",{cwd:config.directory});;
    console.log("git pull output = ", out.toString());
    var out = child_process.execSync("npm install ",{cwd:config.directory});;
    console.log("npm install output = ", out.toString());
    cb(null);
}

function startTask(task, cb) {
    var pid = getTaskPid(task);
    listProcesses(function(pids){
        if(pids.indexOf(pid)>=0) {
            return cb("task is already running: " + task + " " + pid);
        }

        var taskdir = paths.join(common.getConfigDir(),task);
        var config_file = paths.join(taskdir,'config.json');
        var config = JSON.parse(fs.readFileSync(config_file).toString());
        if(config.type != 'node') return new Error("unknown script type " + config.type);
        if(!fs.existsSync(config.directory)) return new Error("directory does not exist " + config.directory);

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
        };
        console.log("spawning",command,cargs,opts);
        var child = child_process.spawn(command, cargs, opts);
        var cpid = child.pid;
        fs.writeFileSync(paths.join(taskdir,'pid'),''+cpid);
        child.unref();
        return cb(null,cpid);
    });

}

function parseJsonPost(req,cb) {
    var chunks = "";
    req.on('data',function(data) { chunks += data.toString(); });
    req.on('end', function() { cb(null,JSON.parse(chunks)); });
};

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
        stopTask(task, function(err) {
            if(err) return ERROR(res,"error from killing " + err);
            return SUCCESS(res,"successfully killed " + task);
        });
    },
    '/start': function(req,res) {
        var task = parseTaskName(req);
        if(!task) return ERROR(res,"no task specified");
        if(!taskExists(task)) return ERROR(res,"no such task " + task);
        startTask(task, function(err,cpid){
            if(err) return ERROR(res,"error"+err);
            SUCCESS(res,"started task " + task + cpid);
        })
    },
    '/stopserver':function(req,res) {
        SUCCESS(res,"stopping the server");
        setTimeout(function(){ process.exit(-1); },100);
    },
    '/rescan':function(req,res) {
        var task = parseTaskName(req);
        if(!task) return ERROR(res,"no task specified");
    },
    '/webhook': function(req,res) {
        console.log("got a webhook");
        parseJsonPost(req,function(err, payload) {
            console.log("payload = ", payload);
            var task = payload.taskname;
            if(!taskExists(task)) return ERROR(res,"no such task " + task);
            var secret = payload.secret;
            var taskdir = paths.join(common.getConfigDir(),task);
            var config_file = paths.join(taskdir,'config.json');
            var config = JSON.parse(fs.readFileSync(config_file).toString());
            console.log("task config = ",config);
            if(!config.watch) return ERROR(res, "task not configured for watching");
            if(config.watch.secret != secret) return ERROR(res, "invalid secret");
            console.log("got the webhook to refresh the process");
            stopTask(task, function() {
                console.log("task is stopped");
                updateTask(task, function() {
                    console.log("task is updated");
                    startTask(task, function() {
                        console.log("task is started");
                        return SUCCESS(res,"got the webhook");
                    });
                });
            });
        });
    }
};

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
});


