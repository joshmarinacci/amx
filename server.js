var common = require('./common');
var paths = require('path');
var fs    = require('fs');
var http  = require('http');
var child_process = require('child_process');
var util  = require('util');

common.initSetup();

var path = paths.join(common.getRootDir(),'status.log');
var logger;
try {
    fs.accessSync(path, fs.W_OK);
    logger = fs.createWriteStream(path, { flags: 'r+'});
} catch(e) {
    logger = fs.createWriteStream(path, { flags: 'w'});
}

function log() {
    var args = Array.prototype.slice.call(arguments,0);
    var str = new Date().getTime() + ": " + args.map(function(a) { return util.inspect(a); }).join(" ")+"\n";
    console.log(str);
    logger.write(str);
}



log("AMX server starting on port ", common.PORT,"with process",process.pid);

var task_map = {};
function getTaskRestartInfo(taskname) {
    if(!task_map[taskname]) { task_map[taskname] = { restart_times:[], enabled:true } }
    var task_info = task_map[taskname];
    return task_info;
}

function ERROR(res,str) {
    log("ERROR",str);
    res.statusCode = 500;
    res.setHeader('Content-Type','text/json');
    res.write(JSON.stringify({status:'error','message':str}));
    res.end();
}
function SUCCESS(res,str) {
    log("SUCCESS",str);
    res.statusCode = 200;
    res.setHeader('Content-Type','text/json');
    res.write(JSON.stringify({status:'success','message':str}));
    res.end();
}


function listProcesses(cb) {
    child_process.exec('ps ax -o pid=',function(err,stdout,stderr){
        var lines = stdout.split('\n');
        // log("got a process list",lines);
        lines = lines.map(function(line) {
            return parseInt(line);
        });
        lines = lines.filter(function(line) {
            return !isNaN(line);
        });
        // log("got a process list",lines);
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
    getTaskRestartInfo(task).enabled = false;
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
    log("config = ", config);
    var out = child_process.execSync("git pull ",{cwd:config.directory});;
    log("git pull output = ", out.toString());
    var out = child_process.execSync("npm install ",{cwd:config.directory});;
    log("npm install output = ", out.toString());
    cb(null);
}

function startTask(task, cb) {
    var pid = getTaskPid(task);
    log("trying to start", task);
    getTaskRestartInfo(task).enabled = true;
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
        //log("spawning",command,cargs,opts);
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
        // log("handling status");
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
            });
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
    '/restart':function(req,res) {
        var task = parseTaskName(req);
        if(!task) return ERROR(res,"no task specified");
        if(!taskExists(task)) return ERROR(res,"no such task " + task);
        stopTask(task, function(err) {
            //if(err) return ERROR(res,"error from killing " + err);
            startTask(task, function(err,cpid){
                if(err) return ERROR(res,"error"+err);
                SUCCESS(res,"started task " + task + cpid);
            });
        });
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
        log("got a webhook");
		var parts = require('url').parse(req.url);
        log("path = ",parts.pathname);
        log("headers = ", req.headers);
        var taskname = parts.pathname.substring('/webhook'.length);
        log("taskname = ", taskname);
        parseJsonPost(req,function(err, payload) {
            var task = taskname;
            if(!taskExists(task)) return ERROR(res,"no such task " + task);
            var secret = payload.secret;
            var config = getTaskConfig(task);
            if(!config.watch) return ERROR(res, "task not configured for watching");
            log("got the webhook to refresh the process");
            stopTask(task, function() {
                log("task is stopped");
                updateTask(task, function() {
                    log("task is updated");
                    startTask(task, function() {
                        log("task is started");
                        return SUCCESS(res,"got the webhook");
                    });
                });
            });
        });
    }
};

http.createServer(function(req,res) {
    var parts = require('url').parse(req.url);
    log("parts = ", parts);
    if(handlers[parts.pathname]) return handlers[parts.pathname](req,res);
    if(parts.pathname.indexOf('/webhook')>=0) {
	    return handlers['/webhook'](req,res);
    }
    log("no handler");

    res.statusCode = 200;
    res.setHeader('Content-Type','text/json');
    res.write(JSON.stringify({'status':'alive'}));
    res.end();
}).listen(common.PORT, function() {
    log("we are up and running");
});



function restartCrashedTask(taskname) {
    var task_info = getTaskRestartInfo(taskname);
    if(task_info.enabled === false) return;

    //stop if restarted more than five times in last 60 seconds
    if(task_info.restart_times.length > 5) {
        var last = task_info.restart_times[task_info.restart_times.length-1];
        var prev = task_info.restart_times[task_info.restart_times.length-5];
        var diff = last-prev;
        if(diff < 60*1000) {
            task_info.enabled = false;
            log("too many respawns. disabling " + taskname);
            return;
        }
    }

    log("restarting crashed task",taskname);
    startTask(taskname, function(err,cpid) {
        if(err) return log("error starting process",err);
        log("restarted",taskname);
        task_map[taskname].restart_times.push(new Date().getTime());
    });
}

function scanProcesses() {
    listProcesses(function(pids){
        fs.readdirSync(common.getConfigDir()).forEach(function(taskname){
            var pid = getTaskPid(taskname);
            if(pids.indexOf(pid) < 0) restartCrashedTask(taskname);
        })
    });
}

//scanProcesses();
setInterval(scanProcesses,500);
