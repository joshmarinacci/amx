import URL from 'url'
import http, { IncomingMessage, ServerResponse } from 'http'
import child_process, { ChildProcessWithoutNullStreams, SpawnOptionsWithoutStdio } from "child_process"
import fs from 'fs'
import paths from 'path'
import {
    read_task_config,
    copy_object_props,
    checkTaskMissing, init, Config
} from "./amx_common.js"
import {file_exists} from "./util.js";
import {make_logger} from "josh_js_util";

const config = await init()

const p = make_logger("SERVER")
const log = (...args:any[]) => {
    p.info(...args)
}
function ERROR(res:ServerResponse,str:string) {
    log("ERROR",str);
    res.statusCode = 500;
    res.setHeader('Content-Type','application/json');
    res.write(JSON.stringify({status:'error','message':str}));
    res.end();
}

function SUCCESS(res:ServerResponse,str:string) {
    log("SUCCESS",str);
    res.statusCode = 200;
    res.setHeader('Content-Type','application/json');
    res.write(JSON.stringify({status:'success','message':str}));
    res.end();
}

function listProcesses():Promise<number[]> {
    return new Promise((res,rej) => {
        child_process.exec('ps ax -o pid=',(err,stdout) => {
            const lines = stdout.split('\n');
            let nums:number[] = lines.map((line) =>parseInt(line))
            nums = nums.filter((line) => !isNaN(line))
            res(nums)
        });
    })
}

type Handler = (req:IncomingMessage, res:ServerResponse) => Promise<void>

const handle_status:Handler = async (req,res) => {
    res.statusCode = 200;
    res.setHeader('Content-Type','application/json');
    res.write(JSON.stringify({'status':'alive'}));
    res.end();
}
const handle_list:Handler = async (req, res) => {
    let pids = await listProcesses()
    p.info("pids",pids)
    res.statusCode = 200;
    const list = await fs.promises.readdir(config.getProcsDir())
    res.setHeader('Content-Type', 'application/json');
    let configs = await Promise.all(list.map(async (name) => await read_task_config(config, name)))
    let tasks = await Promise.all(configs.map(async con => {
        let running = false
        const pid = await getTaskPid(config, con.name)
        if (pids.indexOf(pid) >= 0) running = true;
        return {
            name: con.name,
            path: paths.join(config.getProcsDir(), con.name),
            running: running,
            pid: pid,
            archived: con.archived,
        }
    }))
    res.write(JSON.stringify({'count': tasks.length, tasks: tasks}));
    res.end();
}
const handle_stopserver:Handler = async (req,res) => {
    SUCCESS(res,"stopping the server");
    await setTimeout(() => process.exit(-1),100);
}

const handle_start:Handler = async (req,res) => {
    const taskname = parseTaskName(req);
    await checkTaskMissing(config, taskname)
    let cpid = await startTask(config, taskname)
    SUCCESS(res, "started task " + taskname + ' ' + cpid)
}
const handle_stop:Handler = async (req,res) => {
    const taskname = parseTaskName(req);
    await checkTaskMissing(config,taskname)
    await stopTask(config, taskname)
    SUCCESS(res, "successfully killed " + taskname)
}
const handle_restart:Handler = async (req,res) => {
    const taskname = parseTaskName(req)
    await checkTaskMissing(config, taskname)
    await stopTask(config, taskname)
    let cpid = await startTask(config, taskname)
    SUCCESS(res, "started task " + taskname + ' ' + cpid)
}

const handle_rescan:Handler = async (req,res) => {
    const task = parseTaskName(req);
    if(!task) return ERROR(res,"no task specified");
}
// const handle_webhook = async (req,res) => {
//     log("got a webhook");
//     const parts = URL.parse(req.url)
//     log("path = ", parts.pathname);
//     log("headers = ", req.headers);
//     const taskname = parts.pathname.substring('/webhook/'.length)
//     log("taskname = ", taskname);
//     await checkTaskMissing(config, taskname)
//     const config_json = await read_task_config(config,taskname)
//     log("config is",config_json)
//     if (!config_json.watch) return ERROR(res, "task not configured for watching");
//     parsePost(req, function (err, payload) {
//         if (!validateSecret(payload, config_json, req.headers)) return ERROR(res, "webhook validation failed")
//         const task = taskname
//         if (!taskExists(task)) return ERROR(res, "no such task " + taskname);
//         log("got the webhook to refresh the process");
//         stopTask(taskname).then(() => {
//             log("task is stopped");
//             updateTask(taskname, function () {
//                 log("task is updated");
//                 startTask(taskname).then(() => {
//                     log("task is started");
//                     return SUCCESS(res, "got the webhook");
//                 });
//             });
//         });
//     })
// }


function parseTaskName(req:IncomingMessage) {
    // @ts-ignore
    return URL.parse(req.url).query.split('=')[1]
}

// async function taskExists(task) {
//     if (!task) return false
//     return await file_exists(paths.join(getConfigDir(), task))
// }

async function getTaskPid(config:Config, task:string) {
    const pidfile = paths.join(config.getProcsDir(),task,'pid');
    if(!(await file_exists(pidfile))) return -1
    let raw = await fs.promises.readFile(pidfile)
    return parseInt(raw.toString());
}

type TaskRestartInfo = {
    restart_times:number[]
    enabled:boolean
}
const task_map:Record<string, TaskRestartInfo> = {};
function getTaskRestartInfo(taskname:string):TaskRestartInfo {
    if(!task_map[taskname]) { task_map[taskname] = { restart_times:[], enabled:true } }
    return task_map[taskname];
}

async function reallyStartTask(config:Config, task:string) {
    log("realling starting the task", task)
    const config_json = await read_task_config(config, task)
    const taskdir = paths.join(config.getProcsDir(), task)
    if (!(await file_exists(config_json.directory))) throw new Error("directory does not exist " + config_json.directory)
    let cargs = []
    let command = null
    if (config_json.type === 'npm') {
        cargs = ['run', config_json.script];
        command = 'npm';
    }
    if (config_json.type === 'node') {
        cargs = [config_json.script];
        command = 'node';
    }
    if (config_json.type === 'exe') {
        cargs = []
        if (config_json.args) cargs = config_json.args
        command = config_json.script
    }
    if (command === null) throw new Error("unknown script type " + config_json.type)
    const opts:SpawnOptionsWithoutStdio = {
        cwd: config_json.directory,
        detached: true,
        stdio: [
            'ignore',
            fs.openSync(paths.join(taskdir, 'stdout.log'), 'a'),  // Standard Out
            fs.openSync(paths.join(taskdir, 'stderr.log'), 'a'),  // Standard Error
        ],
        env: {}
    };
    copy_object_props(process.env, opts.env);
    if (config_json.env) copy_object_props(config_json.env, opts.env);
    const child:ChildProcessWithoutNullStreams = child_process.spawn(command, cargs, opts)
    child.on('error', err => log("error spawning ", command))
    await fs.promises.writeFile(paths.join(taskdir,'pid'), '' + child.pid);
    child.unref();
    log("done starting. returning pid")
    return child.pid
}

async function startTask(config:Config, task:string) {
    const pid = await getTaskPid(config, task)
    log("trying to start", task, 'pid is',pid);
    getTaskRestartInfo(task).enabled = true;
    const info = await read_task_config(config,task)
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
    return reallyStartTask(config, task)
}

async function stopTask(config:Config, task:string) {
    getTaskRestartInfo(task).enabled = false;
    const pid = await getTaskPid(config, task);
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

const handlers:Record<string, Handler> = {
    '/status': handle_status,
    '/list': handle_list,
    '/stop': handle_stop,
    '/start': handle_start,
    '/restart':handle_restart,
    '/stopserver':handle_stopserver,
    '/rescan': handle_rescan,
    // '/webhook': handle_webhook,
};

export function make_server() {
    return http.createServer(function(req:IncomingMessage,res:ServerResponse) {
        console.log("inside the request",req.url)
        // @ts-ignore
        const parts = URL.parse(req.url)
        let pathname = parts.pathname
        console.log("pathname is",pathname)
        // if(parts.pathname.indexOf('/webhook')>=0) pathname = '/webhook'
        if(pathname && handlers[pathname]) {
            try {
                return handlers[pathname](req, res)
                    .catch(e => {
                        log("ERROR with handler",pathname)
                        console.error(e)
                        ERROR(res, "error" + e)
                    })
            } catch (e) {
                try {
                    ERROR(res, "error" + e)
                } catch (ee) {
                    console.log("final error")
                    console.error(ee)
                    res.end()
                    return
                }
            }
        }
        log("no handler");
        res.statusCode = 200;
        res.setHeader('Content-Type','text/json');
        res.write(JSON.stringify({'status':'alive'}));
        res.end();
    })
}