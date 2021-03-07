const common = require('./common')
const paths = require('path')
const fs = require('fs')
const http = require('http')
const child_process = require('child_process')
const util = require('util')
const URL = require('url')
const crypto = require('crypto');
const assert = require('assert');

common.initSetup();

const path = paths.join(common.getRootDir(), 'status.log')
let logger
try {
    fs.accessSync(path, fs.W_OK);
    logger = fs.createWriteStream(path, { flags: 'a+'});
    logger.on('close',()=>{
        console.log("the logger has closed")
    })
    logger.on("open",()=>{
        console.log("the logger is open for business")
    })
    logger.on("ready",()=>{
        console.log("the logger is ready for business")
    })
    logger.on("error",()=>{
        console.log("the logger got an error")
    })
    logger.write("=== starting up a log\n")
    console.log("writing to the logger",logger)
} catch(e) {
    logger = fs.createWriteStream(path, { flags: 'w'});
}

function log() {
    const args = Array.prototype.slice.call(arguments, 0)
    const str = new Date().getTime() + ": " + args.map((a) => util.inspect(a)).join(" ") + "\n"
    console.log(str);
    logger.write(str);
}
let sendEmail = function() {};

const config = common.getConfig()
log("config is",config);
log("writing to",path)

function alert() {
    const args = Array.prototype.slice.call(arguments, 0)
    const str = new Date().getTime() + ": " + args.map(a => util.inspect(a)).join(" ") + "\n"
    log('sending an alert', str);
    sendEmail(str);
}

if(config.alerts && config.alerts.email) {
    sendEmail = function(text) {
        const nodemailer = require('nodemailer')
        const transporter = nodemailer.createTransport(config.alerts.email.transport)
        const opts = {
            from: config.alerts.email.from,
            to: config.alerts.email.to,
            subject: "AMX Alert",
            text: "alert:\n" + text,
        }

        transporter.sendMail(opts, (err,info) => {
            if(err) return console.log(err);
            log('sent', info.response);
        });
    }
}

log("AMX server starting on port ", common.PORT,"with process",process.pid);

const task_map = {};
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
        child_process.exec('ps ax -o pid=',(err,stdout) => {
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
    if(!task) return false
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
    const taskdir = paths.join(common.getConfigDir(), task)
    const config_file = paths.join(taskdir, 'config.json')
    return JSON.parse(fs.readFileSync(config_file).toString())
}

function updateTask(task, cb) {
    const config = getTaskConfig(task)
    log("config = ", config);
    log("invoking git in dir",config.directory)
    let out = child_process.execSync("git pull ", {cwd: config.directory})
    log("git pull output = ", out.toString());
    out = child_process.execSync("npm install ", {cwd: config.directory})
    log("npm install output = ", out.toString());
    cb(null);
}

function copyInto(src,dst) {
    for(const name in src) {
        dst[name] = src[name];
    }
}


function startTask(task, cb) {
    const pid = getTaskPid(task)
    log("trying to start", task);
    getTaskRestartInfo(task).enabled = true;
    const info = getTaskConfig(task)
    if(info.archived === true) {
        log("the task is archived")
        getTaskRestartInfo(task).enabled = false;
        return Promise.resolve(-1)
    }
    if('restart' in info && info.restart === false) {
        log("only run the task once")
        getTaskRestartInfo(task).enabled = false;
    }
    return listProcesses().then(pids => {
        if(pids.indexOf(pid)>=0)  throw new Error(`task is already running: ${task} ${pid}`);
        return reallyStartTask(task,cb)
    });
}

function parsePost(req,cb) {
    let chunks = ""
    req.on('data',function(data) { chunks += data.toString(); });
    req.on('end', function() { cb(null,chunks); });
}


const handlers = {
    '/status': (req,res) => {
        res.statusCode = 200;
        res.setHeader('Content-Type','text/json');
        res.write(JSON.stringify({'status':'alive'}));
        res.end();
    },
    '/list': (req,res) => {
        listProcesses().then(pids => {
            res.statusCode = 200;
            const list = fs.readdirSync(common.getConfigDir())
            res.setHeader('Content-Type','text/json');
            let configproms = list.map((name) => getTaskConfig(name))
            Promise.all(configproms).then(configs => {
                let tasks = configs.map(config => {
                    let running = false
                    const pid = getTaskPid(config.name)
                    if(pids.indexOf(pid)>=0) running = true;
                    return {
                        name:config.name,
                        path:paths.join(common.getConfigDir(), config.name),
                        running: running,
                        pid: pid,
                        archived: config.archived,
                    }
                })
                res.write(JSON.stringify({'count':tasks.length,tasks:tasks}));
                res.end();
            })
        });
    },
    '/stop': (req,res) => {
        const task = parseTaskName(req);
        if(!taskExists(task)) return ERROR(res,"no such task " + task);
        return stopTask(task)
            .then(()=> SUCCESS(res,"successfully killed " + task))
            .catch(err => ERROR(res,"error from killing " + err));
    },
    '/start': function(req,res) {
        const task = parseTaskName(req);
        if(!taskExists(task)) return ERROR(res,"no such task " + task);
        startTask(task)
            .then(cpid => SUCCESS(res,"started task " + task + ' ' +cpid))
            .catch(err => ERROR(res,"error"+err));
    },
    '/restart':function(req,res) {
        const task = parseTaskName(req);
        if(!taskExists(task)) return ERROR(res,"no such task " + task);
        stopTask(task)
            .then(()=> startTask(task))
            .then(cpid => SUCCESS(res,"started task " + task + cpid))
            .catch(err => ERROR(res,"error"+err));
    },
    '/stopserver':function(req,res) {
        SUCCESS(res,"stopping the server");
        setTimeout(() => process.exit(-1),100);
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
        const taskname = parts.pathname.substring('/webhook/'.length)
        log("taskname = ", taskname);
        const config = getTaskConfig(taskname)
        if(!config.watch) return ERROR(res, "task not configured for watching");
        parsePost(req,function(err, payload) {
            if(!validateSecret(payload,config,req.headers)) return ERROR(res,"webhook validation failed")
            const task = taskname
            if(!taskExists(task)) return ERROR(res,"no such task " + taskname);
            log("got the webhook to refresh the process");
            stopTask(taskname).then(()=>{
                log("task is stopped");
                updateTask(taskname, function() {
                    log("task is updated");
                    startTask(taskname).then(() =>{
                        log("task is started");
                        return SUCCESS(res,"got the webhook");
                    });
                });
            });
        });
    }
};

http.createServer(function(req,res) {
    console.log("inside the request")
    const parts = URL.parse(req.url)
    log(parts.path);
    if(handlers[parts.pathname]) return handlers[parts.pathname](req,res);
    if(parts.pathname.indexOf('/webhook')>=0) return handlers['/webhook'](req,res);
    log("no handler");
    res.statusCode = 200;
    res.setHeader('Content-Type','text/json');
    res.write(JSON.stringify({'status':'alive'}));
    res.end();
}).listen(common.PORT, function() {
    log("we are up and running");
});



function restartCrashedTask(taskname) {
    const info = getTaskConfig(taskname)
    if(info.archived === true) return false
    const task_info = getTaskRestartInfo(taskname)
    if(task_info.enabled === false) return;
    if('restart' in info && info.restart === false) return

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

setInterval(scanProcesses,5000);

function validateSecret(payload, config, headers) {
    log("config for task is",config)
    // log('the raw payload is',payload)
    try {
        const buffer = Buffer.from(payload)
        log("bufer is", buffer)
        const sig = signBody('sha1', config.watch.secret, buffer)
        log("the signature is", sig)
        log("matching header is",headers['x-hub-signature'])
        if(sig === headers['x-hub-signature']) {
            return true
        }
        return false
    } catch (e) {
        log("soem weird error",e)
        return false
    }
}

function signBody(algorithm, secret, buffer) {
    assert(secret, 'Secret is required');
    assert(algorithm, 'Algorithm is required');
    const hmac = crypto.createHmac(algorithm, secret);
    hmac.update(buffer, 'utf-8');
    return algorithm + '=' + hmac.digest('hex');
}