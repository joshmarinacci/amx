#!/usr/bin/env node
import {getConfig, getConfigDir, getRootDir, initSetup, PORT, startServer} from './common.js'
import {default as paths} from 'path'
import {default as http} from 'http'
import {default as ch} from 'child_process'
import {default as fs} from 'fs'
import {default as tail} from 'tail'
import {fileURLToPath} from 'url'
import {makeTask, printUsage} from './src/cli_common.js'
const Tail = tail.Tail

initSetup();


function spaces(n) {
    let str = "";
    for(let i=0; i<n; i++) {
        str +=' ';
    }
    return str;
}
function pad(str,n) {
    if(!str) return spaces(n);
    if(str.length < n) return str + spaces(n-str.length);
    return str;
}
function info() {
    const args = Array.prototype.slice.call(arguments, 0)
    console.log('AMX:',args.join(" "))
}
function error() {
    const args = Array.prototype.slice.call(arguments, 0)
    console.log('AMX ERROR:',args.join(" "))
}
function checkTaskMissing(taskname) {
    if(!taskname) {
        error('missing taskname')
        return true
    }
    const path = paths.join(getConfigDir(),taskname)
    if(!fs.existsSync(path)) {
        error(`task '${taskname}' does not exist at ${path}`)
        return true
    }
    return false
}
function checkMissingFile(path) {
    if(!fs.existsSync(path)) {
        error(`file '${path}' does not exist`)
        return true
    }
    return false
}
function doGet(path) {
    return new Promise((resolve,rej) => {
        const req = http.request({
                host: 'localhost',
                port: PORT,
                method: 'GET',
                path: path
            },
            (res) => {
                let chunks = ""
                res.on('data', (data) => chunks += data.toString())
                res.on('end', () => resolve(JSON.parse(chunks)))
            }
        );
        req.on('error', (e)=> rej(e))
        req.end()
    })
}
function doPost(path) {
    return checkRunning().then(()=>{
        console.log("inside then")
        return new Promise((resolve,rej) => {
            console.log("should be running now")
            const req = http.request({
                    host: 'localhost',
                    port: PORT,
                    method: 'POST',
                    path: path
                },
                (res) => {
                    let chunks = ""
                    res.on('data', (data) => chunks += data.toString())
                    res.on('end', () => resolve(JSON.parse(chunks)))
                }
            );
            req.on('error', (e)=> rej(e))
            req.end()
        })
    }).catch(e => {
        console.log("error happened",e)
    })
}


function printTasks(tasks) {
    if(tasks.length <= 0) return console.log("no running tasks");
    tasks.forEach(task => console.log("task " ,pad(task.name,20), task.running?'running':'stopped', task.pid, task.archived?'archived':'active'));
}

function listProcesses() {
    checkRunning()
        .then(()=> doGet('/list'))
        .then(data => printTasks(data.tasks))
}

function stopServer() {
    checkRunning()
        .then(() => doPost('/stopserver'))
        .then(data => console.log("response = ", data))
}

function checkRunning() {
    return new Promise((res,rej) => {
        const req = http.request({
                host:'localhost',
                port:PORT,
                method:'GET',
                path:'/status'},
            (response => res(response)))
        req.on('error',e=> {
            if(e.code === 'ECONNREFUSED') {
                info("can't connect to server. starting")
                setTimeout(() =>{
                    console.log("finishing promise")
                    res()
                },1000)
                try {
                    startServer();
                } catch (e) {
                    console.log("error starting the server",e)
                }
            }
        });
        req.end();
    })
}



function startTask(args) {
    const taskname = args[0]
    info(`starting the task '${taskname}'`)
    doPost("/start?task="+taskname).then(res => console.log(res))
}

function stopTask(args) {
    const taskname = args[0]
    info(`stopping the task '${taskname}'`);
    doPost("/stop?task="+taskname).then(res => console.log(res))
}

function restartTask(args) {
    const taskname = args[0]
    info(`restarting the task ${taskname}`);
    doPost("/restart?task="+taskname).then(res => console.log(res))
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

function archiveTask(args) {
    const taskname = args[0]
    info(`archiving the task ${taskname}`)
    if(checkTaskMissing(taskname)) return
    const config = paths.join(getConfigDir(), taskname, 'config.json')
    const json = JSON.parse(fs.readFileSync(config))
    json.archived = true
    fs.writeFileSync(config,JSON.stringify(json,null,"   "))
    console.log("wrote",JSON.parse(fs.readFileSync(config)))
}

function unarchiveTask(args) {
    const taskname = args[0]
    info(`archiving the task ${taskname}`)
    if(checkTaskMissing(taskname)) return
    const config = paths.join(getConfigDir(), taskname, 'config.json')
    const json = JSON.parse(fs.readFileSync(config))
    json.archived = false
    fs.writeFileSync(config,JSON.stringify(json,null,"   "))
    console.log("wrote",JSON.parse(fs.readFileSync(config)))
}

function logTask(args) {
    const taskname = args[0]
    if(checkTaskMissing(taskname)) return
    const logPath = paths.join(getConfigDir(),taskname,'stdout.log')
    if(checkMissingFile(logPath)) return
    fs.createReadStream(logPath).pipe(process.stdout);
}

function followTask(args) {
    const taskname = args[0]
    if(checkTaskMissing(taskname)) return
    const outPath = paths.join(getConfigDir(),taskname,'stdout.log')
    if(checkMissingFile(outPath)) return
    const errPath = paths.join(getConfigDir(),taskname,'stderr.log')
    if(checkMissingFile(errPath)) return
    const stdoutTail = new Tail(outPath)
    stdoutTail.on('line', (data) => console.log(data))
    stdoutTail.on('error', (data) => console.log('ERROR:',data))
    const stderrTail = new Tail(errPath)
    stderrTail.on('line', (data) => console.log(data))
    stderrTail.on('error', (data) => console.log('ERROR:',data))
}

function infoTask(args) {
    const taskname = args[0]
    if(checkTaskMissing(taskname)) return
    const config = paths.join(getConfigDir(), taskname, 'config.json')
    fs.createReadStream(config).pipe(process.stdout);
}

function printVersion() {
    info(JSON.parse(fs.readFileSync(paths.join(__dirname, "package.json")).toString()).version)
}

function selfStatus() {
    info("AMX");
    printVersion();
    info("Config", paths.join(getRootDir(),'config.json'));
    info(JSON.stringify(getConfig(),null,'    '));
    info("server on port ", PORT);
    info("process descriptions", getConfigDir());
}

function spawnEditor(editorpath, file) {
    const vim = ch.spawn(editorpath, [file], { stdio: 'inherit' })
    vim.on('exit', code => info(`done editing ${file}`))
}

function editTask(args) {
    const taskname = args[0]
    if(!taskname) return console.log("ERROR: missing taskname");
    const config = paths.join(getConfigDir(), taskname, 'config.json')
    if(process.env.EDITOR) {
        console.log("launching the editor", process.env.EDITOR);
        return spawnEditor(process.env.EDITOR,config);
    } else {
        //detect location of pico
        return ch.exec('which pico', function(err,stdout,stderr) {
            if(err && err.code == 1) {
                return ch.exec('which vi',function(err,stdout,stderr) {
                    if (err && err.code == 1) return console.log("no valid editor not found. please set the EDITOR variable");
                    return spawnEditor(stdout.trim(),config);
                });
            }
            return spawnEditor(stdout.trim(),config);
        });
    }
}


const commands = {
    'list': listProcesses,
    'stopserver':stopServer,
    'make':makeTask,
    'start':startTask,
    'stop':stopTask,
    'restart':restartTask,
    'archive':archiveTask,
    'unarchive':unarchiveTask,
    'log':logTask,
    'info':infoTask,
    'version':printVersion,
    'edit':editTask,
    'selfstatus':selfStatus,
    'follow':followTask,
};

function runCommand(args) {
    const command = args.shift()
    if(commands[command]) return commands[command](args);
    console.log("no such command: " + command);
    return printUsage();
}


const args = process.argv.slice();
if(args.length < 3) {
    printUsage();
} else {
    args.shift();
    args.shift();
    runCommand(args);
}

