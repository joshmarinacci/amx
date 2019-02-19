var common = require('./common');
var paths = require('path');
var fs    = require('fs');
var http  = require('http');
var child_process = require('child_process');
var util  = require('util');
const URL = require('url')

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
var sendEmail = function() {};

var config = common.getConfig();
console.log("config is",config);

function alert() {
    var args = Array.prototype.slice.call(arguments,0);
    var str = new Date().getTime() + ": " + args.map(function(a) { return util.inspect(a); }).join(" ")+"\n";
    console.log('sending an alert', str);
    sendEmail(str);
}

if(config.alerts &&
   config.alerts.email) {
    sendEmail = function(text) {
        var nodemailer = require('nodemailer');
        var transporter = nodemailer.createTransport(config.alerts.email.transport);
        var opts = {
            from: config.alerts.email.from,
            to: config.alerts.email.to,
            subject: "AMX Alert",
            text: "alert:\n" + text,
        };

        transporter.sendMail(opts, function(err,info) {
            if(err) return console.log(err);
            console.log('sent', info.response);
        });
    }
}


log("AMX server starting on port ", common.PORT,"with process",process.pid);

var task_map = {};
function getTaskRestartInfo(taskname) {
    if(!task_map[taskname]) { task_map[taskname] = { restart_times:[], enabled:true } }
    return task_map[taskname];
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
    return new Promise((res,rej) => {
        child_process.exec('ps ax -o pid=',function(err,stdout,stderr){
            let lines = stdout.split('\n');
            lines = lines.map((line) =>parseInt(line))
            lines = lines.filter((line) => !isNaN(line))
            res(lines)
        });
    })
}

function parseTaskName(req) {
    return URL.parse(req.url).query.split('=')[1]
}

function taskExists(task) {
    return fs.existsSync(paths.join(common.getConfigDir(), task))
}

function getTaskPid(task) {
    const pidfile = paths.join(common.getConfigDir(),task,'pid');
    if(!fs.existsSync(pidfile)) return -1;
    return parseInt(fs.readFileSync(pidfile).toString());
}

function stopTask(task, cb) {
    getTaskRestartInfo(task).enabled = false;
    const pid = getTaskPid(task);
    return listProcesses().then(pids => {
        if(pids.indexOf(pid)>=0) {
            process.kill(pid,'SIGINT');
            return null
        } else {
            return "process not running"
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

function copyInto(src,dst) {
    for(var name in src) {
        dst[name] = src[name];
    }
}


function startTask(task, cb) {
    const pid = getTaskPid(task)
    log("trying to start", task);
    getTaskRestartInfo(task).enabled = true;
    return listProcesses().then(pids => {
        if(pids.indexOf(pid)>=0)  throw new Error(`task is already running: ${task} ${pid}`);

        var taskdir = paths.join(common.getConfigDir(),task);
        var config_file = paths.join(taskdir,'config.json');
        var config = JSON.parse(fs.readFileSync(config_file).toString());
        if(!fs.existsSync(config.directory)) return cb(new Error("directory does not exist " + config.directory));
        var stdout_log = paths.join(taskdir,'stdout.log');
        var stderr_log = paths.join(taskdir,'stderr.log');
        var out = fs.openSync(stdout_log, 'a');
        var err = fs.openSync(stderr_log, 'a');
        var cargs = null;
        var command = null;
        if(config.type === 'npm')  {
            cargs = ['run',config.script];
            command = 'npm';
        }
        if(config.type === 'node') {
            cargs = [config.script];
            command = 'node';
        }
        if(config.type === 'exe') {
            cargs = []
            command = config.script
        }
        if(command === null) return cb(new Error("unknown script type " + config.type));
        var opts = {
            cwd:config.directory,
            detached:true,
            stdio:['ignore',out,err],
            env: {}
        };
        copyInto(process.env,opts.env);
        if(config.env) copyInto(config.env,opts.env);
        //log("spawning",command,cargs,opts);
        const child = child_process.spawn(command, cargs, opts)
        const cpid = child.pid
        fs.writeFileSync(paths.join(taskdir,'pid'),''+cpid);
        child.unref();
        return cpid
    });
}

function parseJsonPost(req,cb) {
    var chunks = "";
    req.on('data',function(data) { chunks += data.toString(); });
    req.on('end', function() { cb(null,JSON.parse(chunks)); });
};

var handlers = {
    '/status': function(req,res) {
        res.statusCode = 200;
        res.setHeader('Content-Type','text/json');
        res.write(JSON.stringify({'status':'alive'}));
        res.end();
    },
    '/list': function(req,res) {
        listProcesses().then(pids => {
            res.statusCode = 200;
            var list = fs.readdirSync(common.getConfigDir());
            res.setHeader('Content-Type','text/json');
            var tasks = list.map(function(name) {
                let running = false
                const dir = paths.join(common.getConfigDir(), name)
                const pid = getTaskPid(name)
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
    '/stop': (req,res) => {
        const task = parseTaskName(req);
        if(!task) return ERROR(res,"no task specified");
        if(!taskExists(task)) return ERROR(res,"no such task " + task);
        return stopTask(task)
            .then(()=> SUCCESS(res,"successfully killed " + task))
            .catch(err => ERROR(res,"error from killing " + err));
    },
    '/start': function(req,res) {
        const task = parseTaskName(req);
        if(!task) return ERROR(res,"no task specified");
        if(!taskExists(task)) return ERROR(res,"no such task " + task);
        startTask(task)
            .then(cpid => SUCCESS(res,"started task " + task + cpid))
            .catch(err => ERROR(res,"error"+err));
    },
    '/restart':function(req,res) {
        const task = parseTaskName(req);
        if(!task) return ERROR(res,"no task specified");
        if(!taskExists(task)) return ERROR(res,"no such task " + task);
        stopTask(task)
            .then(()=> startTask(task))
            .then(cpid => SUCCESS(res,"started task " + task + cpid))
            .catch(err => ERROR(res,"error"+err));
    },
    '/stopserver':function(req,res) {
        SUCCESS(res,"stopping the server");
        setTimeout(function(){ process.exit(-1); },100);
    },
    '/rescan':function(req,res) {
        const task = parseTaskName(req);
        if(!task) return ERROR(res,"no task specified");
    },
    '/webhook': function(req,res) {
        log("got a webhook");
        const parts = URL.parse(req.url)
        log("path = ",parts.pathname);
        log("headers = ", req.headers);
        const taskname = parts.pathname.substring('/webhook'.length)
        log("taskname = ", taskname);
        parseJsonPost(req,function(err, payload) {
            const task = taskname
            if(!taskExists(task)) return ERROR(res,"no such task " + task);
            const secret = payload.secret
            const config = getTaskConfig(task)
            if(!config.watch) return ERROR(res, "task not configured for watching");
            log("got the webhook to refresh the process");
            stopTask(task).then(()=>{
                log("task is stopped");
                updateTask(task, function() {
                    log("task is updated");
                    startTask(task).then(() =>{
                        log("task is started");
                        return SUCCESS(res,"got the webhook");
                    });
                });
            });
        });
    }
};

http.createServer(function(req,res) {
    const parts = URL.parse(req.url)
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
        const last = task_info.restart_times[task_info.restart_times.length - 1]
        const prev = task_info.restart_times[task_info.restart_times.length - 5]
        if(last - prev < 60*1000) {
            task_info.enabled = false;
            alert("too many respawns, disabling" + taskname);
            log("too many respawns. disabling " + taskname);
            return;
        }
    }

    alert("restarting crashed task",taskname);
    task_map[taskname].restart_times.push(new Date().getTime());
    startTask(taskname).then(cpid => {
        log("restarted",taskname);
        alert("restarted",taskname);
    }).catch(err => {
        alert("error starting process",err);
        return log("error starting process",err);
    })
}

function scanProcesses() {
    listProcesses().then(pids => {
        fs.readdirSync(common.getConfigDir()).forEach((taskname) => {
            const pid = getTaskPid(taskname);
            if(pids.indexOf(pid) < 0) restartCrashedTask(taskname);
        })
    });
}

setInterval(scanProcesses,500);
