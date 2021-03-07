import URL from 'url'
import http from 'http'
import child_process from "child_process"
import fs from 'fs'
import paths from 'path'
import {getConfigDir} from "../common.js"
import {file_exists, log} from './amx_common.js'


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

async function getTaskConfig(task) {
    const taskdir = paths.join(getConfigDir(), task)
    const config_file = paths.join(taskdir, 'config.json')
    let data = await fs.promises.readFile(config_file)
    return JSON.parse(data.toString())
}

function l() {
    console.log(...arguments)
}
const handle_list = async (req, res) => {
    l("listing")
    let pids = await listProcesses()
    res.statusCode = 200;
    const list = await fs.promises.readdir(getConfigDir())
    res.setHeader('Content-Type', 'application/json');
    let configs = await Promise.all(list.map(async (name) => await getTaskConfig(name)))
    let tasks = await Promise.all(configs.map(async config => {
        let running = false
        const pid = await getTaskPid(config.name)
        if (pids.indexOf(pid) >= 0) running = true;
        return {
            name: config.name,
            path: paths.join(getConfigDir(), config.name),
            running: running,
            pid: pid,
            archived: config.archived,
        }
    }))
    l("task",tasks)
    res.write(JSON.stringify({'count': tasks.length, tasks: tasks}));
    res.end();
}

function parseTaskName(req) {
    return URL.parse(req.url).query.split('=')[1]
}

async function taskExists(task) {
    if (!task) return false
    return await file_exists(paths.join(getConfigDir(), task))
}

async function getTaskPid(task) {
    const pidfile = paths.join(getConfigDir(),task,'pid');
    if(!(await file_exists(pidfile))) return -1
    let raw = await fs.promises.readFile(pidfile)
    return parseInt(raw.toString());
}


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

async function reallyStartTask(task, cb) {
    log("realling starting the task", task)
    const config = await getTaskConfig(task)
    // log("task info is", config)
    const taskdir = paths.join(getConfigDir(), task)
    // log("taskdir is",taskdir)
    // const config = JSON.parse(fs.readFileSync(paths.join(taskdir, 'config.json')).toString())
    // log("config is", config)
    if (!(await file_exists(config.directory))) throw new Error("directory does not exist " + config.directory)
    let cargs = []
    let command = null
    if (config.type === 'npm') {
        cargs = ['run', config.script];
        command = 'npm';
    }
    if (config.type === 'node') {
        cargs = [config.script];
        command = 'node';
    }
    if (config.type === 'exe') {
        cargs = []
        if (config.args) cargs = config.args
        command = config.script
    }
    if (command === null) throw new Error("unknown script type " + config.type)
    const opts = {
        cwd: config.directory,
        detached: true,
        stdio: [
            'ignore',
            fs.openSync(paths.join(taskdir, 'stdout.log'), 'a'),  // Standard Out
            fs.openSync(paths.join(taskdir, 'stderr.log'), 'a'),  // Standard Error
        ],
        env: {}
    };
    copyInto(process.env, opts.env);
    if (config.env) copyInto(config.env, opts.env);
    // log("spawning", command, cargs/*,opts*/);
    const child = child_process.spawn(command, cargs, opts)
    child.on('error', err => log("error spawning ", command))
    await fs.promises.writeFile(paths.join(taskdir,'pid'), '' + child.pid);
    child.unref();
    log("done. returning pid")
    return child.pid
}

async function startTask(task) {
    const pid = await getTaskPid(task)
    log("trying to start", task, 'pid is',pid);
    getTaskRestartInfo(task).enabled = true;
    const info = await getTaskConfig(task)
    // log("task info is",info)
    if(info.archived === true) {
        log("the task is archived")
        getTaskRestartInfo(task).enabled = false;
        return -1
    }
    if('restart' in info && info.restart === false) {
        log("only run the task once")
        getTaskRestartInfo(task).enabled = false;
    }
    let pids = await listProcesses()
    if(pids.indexOf(pid)>=0)  throw new Error(`task is already running: ${task} ${pid}`);
    return reallyStartTask(task)
}

const handle_start = async (req,res) => {
    const task = parseTaskName(req);
    try {
        if (!(await taskExists(task))) return ERROR(res, "no such task " + task);
        let cpid = await startTask(task)
        SUCCESS(res, "started task " + task + ' ' + cpid)
    } catch (e) {
        console.error("ERROR!",e)
        ERROR(res, "error" + e)
    }
}

async function stopTask(task, cb) {
    getTaskRestartInfo(task).enabled = false;
    const pid = await getTaskPid(task);
    let pids = await listProcesses()
    if (pids.indexOf(pid) >= 0) {
        log("killing the pid", pid)
        process.kill(pid, 'SIGINT');
        return null
    } else {
        log("couldn't find the pid")
        return "process not running"
    }
}

const handle_stop = async (req,res) => {
    try {
        const task = parseTaskName(req);
        if (!(await taskExists(task))) return ERROR(res, "no such task " + task);
        await stopTask(task)
        SUCCESS(res, "successfully killed " + task)
    } catch(err) {
        ERROR(res,"error from killing " + err)
    }
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
    return http.createServer(function(req,res) {
        console.log("inside the request",req.url)
        const parts = URL.parse(req.url)
        if(handlers[parts.pathname]) {
            return handlers[parts.pathname](req, res)
                .catch(e => {
                    l("ERROR")
                    console.error(e)
                })
        }
        if(parts.pathname.indexOf('/webhook')>=0) return handlers['/webhook'](req,res);
        log("no handler");
        res.statusCode = 200;
        res.setHeader('Content-Type','text/json');
        res.write(JSON.stringify({'status':'alive'}));
        res.end();
    })
}