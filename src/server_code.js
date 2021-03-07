import URL from 'url'
import http from 'http'
import child_process from "child_process"
import fs from 'fs'
import paths from 'path'
import {getConfigDir} from "../common.js"


function ERROR(res,str) {
    log("ERROR",str);
    res.statusCode = 500;
    res.setHeader('Content-Type','application/json');
    res.write(JSON.stringify({status:'error','message':str}));
    res.end();
}

function SUCCESS(res,str) {
    log("SUCCESS",str);
    res.statusCode = 200;
    res.setHeader('Content-Type','application/json');
    res.write(JSON.stringify({status:'success','message':str}));
    res.end();
}

function listProcesses() {
    return new Promise((res,rej) => {
        l("doing child proc")
        child_process.exec('ps ax -o pid=',(err,stdout) => {
            let lines = stdout.split('\n');
            lines = lines.map((line) =>parseInt(line))
            lines = lines.filter((line) => !isNaN(line))
            res(lines)
        });
    })
}



const handle_status = (req,res) => {
    res.statusCode = 200;
    res.setHeader('Content-Type','application/json');
    res.write(JSON.stringify({'status':'alive'}));
    res.end();
}

function getTaskConfig(task) {
    const taskdir = paths.join(getConfigDir(), task)
    const config_file = paths.join(taskdir, 'config.json')
    return JSON.parse(fs.readFileSync(config_file).toString())
}

function l() {
    console.log(...arguments)
}
const handle_list = async (req, res) => {
    l("listing")
    let pids = await listProcesses()
    res.statusCode = 200;
    const list = fs.readdirSync(getConfigDir())
    console.log("list is",list)
    res.setHeader('Content-Type', 'application/json');
    let configproms = list.map((name) => getTaskConfig(name))
    await Promise.all(configproms).then(configs => {
        let tasks = configs.map(config => {
            let running = false
            const pid = getTaskPid(config.name)
            if (pids.indexOf(pid) >= 0) running = true;
            return {
                name: config.name,
                path: paths.join(getConfigDir(), config.name),
                running: running,
                pid: pid,
                archived: config.archived,
            }
        })
        res.write(JSON.stringify({'count': tasks.length, tasks: tasks}));
        res.end();
    })
}

function parseTaskName(req) {
    return URL.parse(req.url).query.split('=')[1]
}

function taskExists(task) {
    if(!task) return false
    return fs.existsSync(paths.join(getConfigDir(), task))
}

function getTaskPid(task) {
    const pidfile = paths.join(getConfigDir(),task,'pid');
    if(!fs.existsSync(pidfile)) return -1;
    return parseInt(fs.readFileSync(pidfile).toString());
}

function log() {  console.log("LOG",...arguments) }

const task_map = {};
function getTaskRestartInfo(taskname) {
    if(!task_map[taskname]) { task_map[taskname] = { restart_times:[], enabled:true } }
    return task_map[taskname];
}

function copyInto(src,dst) {
    for(const name in src) {
        dst[name] = src[name];
    }
}

function reallyStartTask(task, cb) {
    log("realling starting the task",task)
    const taskdir = paths.join(getConfigDir(), task)
    const config = JSON.parse(fs.readFileSync(paths.join(taskdir, 'config.json')).toString())
    log("config is",config)
    if(!fs.existsSync(config.directory)) throw new Error("directory does not exist " + config.directory)
    let cargs = []
    let command = null
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
        if(config.args) cargs = config.args
        command = config.script
    }
    if(command === null) throw new Error("unknown script type " + config.type)
    const opts = {
        cwd:config.directory,
        detached:true,
        stdio:[
            'ignore',
            fs.openSync(paths.join(taskdir, 'stdout.log'), 'a'),  // Standard Out
            fs.openSync(paths.join(taskdir, 'stderr.log'), 'a'),  // Standard Error
        ],
        env: {}
    };
    copyInto(process.env,opts.env);
    if(config.env) copyInto(config.env,opts.env);
    log("spawning",command,cargs/*,opts*/);
    const child = child_process.spawn(command, cargs, opts)
    child.on('error',err => log("error spawning ",command))
    fs.writeFileSync(paths.join(taskdir,'pid'),''+child.pid);
    child.unref();
    log("done. returning pid")
    return child.pid
}

function startTask(task) {
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
        return reallyStartTask(task)
    });
}

const handle_start = async (req,res) => {
    const task = parseTaskName(req);
    try {
        if (!taskExists(task)) return ERROR(res, "no such task " + task);
        return startTask(task)
            .then(cpid => SUCCESS(res, "started task " + task + ' ' + cpid))
            .catch(err => {
                ERROR(res, "error" + err)
            });
    } catch (e) {
        console.error("ERROR!",e)
        // e.trace()
    }
}

function stopTask(task, cb) {
    getTaskRestartInfo(task).enabled = false;
    const pid = getTaskPid(task);
    return listProcesses().then(pids => {
        log("looking for pid",pid)
        if(pids.indexOf(pid)>=0) {
            log("killing the pid",pid)
            process.kill(pid,'SIGINT');
            return null
        } else {
            log("couldn't find the pid")
            return "process not running"
        }
    });
}

const handle_stop = async (req,res) => {
    const task = parseTaskName(req);
    if(!taskExists(task)) return ERROR(res,"no such task " + task);
    return stopTask(task)
        .then(()=> SUCCESS(res,"successfully killed " + task))
        .catch(err => ERROR(res,"error from killing " + err));
}

const handlers = {
    '/status': handle_status,
    '/list': handle_list,
    '/stop': handle_stop,
    '/start': handle_start,
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

export function make_server() {
    let server = http.createServer(function(req,res) {
        console.log("inside the request",req.url)
        const parts = URL.parse(req.url)
        // log(parts.path);
        if(handlers[parts.pathname]) {
            return handlers[parts.pathname](req, res)
                .then(()=>{console.log("done")})
                .catch(e => {
                    l("ERROR")
                    console.error(e)
                })
        }
        if(parts.pathname.indexOf('/webhook')>=0) return handlers['/webhook'](req,res);
        // log("no handler");
        res.statusCode = 200;
        res.setHeader('Content-Type','text/json');
        res.write(JSON.stringify({'status':'alive'}));
        res.end();
    })
    // console.log("server is",server)
    return server
}