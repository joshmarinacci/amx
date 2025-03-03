import {default as paths} from 'path'
import {
    checkTaskMissing,
    CONFIG_TEMPLATE,
    file_exists,
    getConfig,
    getConfigDir,
    getRootDir,
    info,
    pad,
    PORT,
    read_task_config,
    startServer,
    write_task_config
} from './amx_common'
import {createReadStream, promises as fs} from 'fs'
import {fileURLToPath} from 'url'
import {default as ch} from 'child_process'
import {sleep} from "josh_js_util";

type Task = {
    name: string,
    path:string,
    running:boolean,
    pid:number,
    archived?:boolean,
}
export async function listProcesses() {
    await checkRunning()
    let req = await fetch(`http://localhost:${PORT}/list`)
    const data = await req.json()
    if(data['tasks']) {
        let tasks: Task[] = data.tasks
        if (tasks.length <= 0) return console.log("no running tasks");
        tasks.forEach(task => {
            info("task ",
                pad(task.name, 20),
                task.running ? 'running' : 'stopped',
                task.pid,
                task.archived ? 'archived' : 'active')
        });
    }
}
export async function stopServer() {
    await checkRunning()
    let data = await doPost('/stopserver')
    console.log("response = ", data)
}
export async function printVersion() {
    let dir = paths.dirname(fileURLToPath(import.meta.url))
    let data = await fs.readFile(paths.join(dir,'..','package.json'))
    info(JSON.parse(data.toString()).version)
}
export async function selfStatus() {
    info("AMX");
    await printVersion();
    info("Config", paths.join(getRootDir(),'config.json'));
    info(JSON.stringify(getConfig(),null,'    '));
    info("server on port ", PORT);
    info("process descriptions", getConfigDir());
}

export async function makeTask(args) {
    const taskname = args.shift()
    // info("making the task",taskname);
    if(!taskname) return printUsage();
    const procpath = paths.join(getConfigDir(), taskname)
    if(!(await file_exists(procpath))) await fs.mkdir(procpath)
    // info("made dir",procpath);
    const confpath = paths.join(procpath, 'config.json')
    const config = JSON.parse(JSON.stringify(CONFIG_TEMPLATE))
    config.name = taskname;

    if(args.length > 0) {
        config.script = args[0];
        config.directory = process.cwd();
    }
    await fs.writeFile(confpath,JSON.stringify(config,null,'    '));
    info("edit the config file",confpath);
    info("then run: amx start ",taskname);
    return confpath
}

export async function startTask(args) {
    const taskname = args[0]
    await checkTaskMissing(taskname)
    info(`starting the task '${taskname}'`)
    let res = await doPost("/start?task="+taskname)
    console.log(res)
}
export async function stopTask(args) {
    const taskname = args[0]
    await checkTaskMissing(taskname)
    info(`stopping the task '${taskname}'`);
    let res = await doPost("/stop?task="+taskname)
    console.log(res)
}
export async function restartTask(args) {
    const taskname = args[0]
    await checkTaskMissing(taskname)
    info(`restarting the task ${taskname}`);
    let res = await doPost("/restart?task="+taskname)
    console.log(res)
}

export async function logTask(args) {
    const taskname = args[0]
    await checkTaskMissing(taskname)
    const logPath = paths.join(getConfigDir(),taskname,'stdout.log')
    console.log("looking at",logPath)
    if(await file_exists(logPath)) createReadStream(logPath).pipe(process.stdout);

    const errPath = paths.join(getConfigDir(),taskname,'stderr.log')
    if(await file_exists(errPath)) createReadStream(errPath).pipe(process.stdout);
}
export async function followTask(args) {
    const taskname = args[0]
    await checkTaskMissing(taskname)
    const outPath = paths.join(getConfigDir(),taskname,'stdout.log')
    if(! (await file_exists(outPath))) return
    const errPath = paths.join(getConfigDir(),taskname,'stderr.log')
    if(!(await file_exists(errPath))) return
    const stdoutTail = new Tail(outPath)
    stdoutTail.on('line', (data) => console.log(data))
    stdoutTail.on('error', (data) => console.log('ERROR:',data))
    const stderrTail = new Tail(errPath)
    stderrTail.on('line', (data) => console.log(data))
    stderrTail.on('error', (data) => console.log('ERROR:',data))
}
export async function infoTask(args) {
    const taskname = args[0]
    await checkTaskMissing(taskname)
    const config = paths.join(getConfigDir(), taskname, 'config.json')
    createReadStream(config).pipe(process.stdout);
}

export async function editTask(args) {
    const taskname = args[0]
    if(!taskname) return console.log("ERROR: missing taskname");
    await checkTaskMissing(taskname)
    const config = paths.join(getConfigDir(), taskname, 'config.json')
    if(process.env.EDITOR) return spawnEditor(process.env.EDITOR,config);
    //detect location of pico
    let [stdout_pico, pico] = await which_command('pico')
    if(pico === 0) return spawnEditor(stdout_pico,config)
    let [stdout_vi, vi] = await which_command('vi')
    if(vi === 0) return spawnEditor(stdout_vi,config)
    return console.log("no valid editor not found. please set the EDITOR variable");
}
export async function archiveTask(args) {
    const taskname = args[0]
    info(`archiving the task ${taskname}`)
    await checkTaskMissing(taskname)
    let json = await read_task_config(taskname)
    json.archived = true
    await write_task_config(taskname,json)
    console.log("wrote out", await read_task_config(taskname))
}
export async function unarchiveTask(args) {
    const taskname = args[0]
    info(`archiving the task ${taskname}`)
    await checkTaskMissing(taskname)
    let json = await read_task_config(taskname)
    json.archived = false
    await write_task_config(taskname,json)
    console.log("wrote out", await read_task_config(taskname))
}

export async function nuke_task(args) {
    const taskname = args[0]
    const taskname2 = args[1]
    if(!taskname || taskname !== taskname2) return console.log("you must type the name twice to nuke a task")
    await stopTask([taskname])
    info("fully stopped")
    let taskdir = paths.join(getConfigDir(),taskname)
    info("nuking ", taskdir)
    await fs.rmdir(taskdir, {recursive:true})
}


async function which_command(cmd:string):Promise<[string,number]> {
    return new Promise((res,rej)=>{
        ch.exec(`which ${cmd}`,(err,stdout,stderr) => {
            if(err) res([stderr,err])
            res([stdout.trim(),0])
        })
    })
}

export async function checkRunning() {
    try {
        await fetch(`http://localhost:${PORT}/status`)
    } catch (e) {
        console.log("server doesn't seem to be running. lets start it")
        startServer()
        await sleep(1)
    }
}

function spawnEditor(editorpath, file) {
    const vim = ch.spawn(editorpath, [file], { stdio: 'inherit' })
    vim.on('exit', code => info(`done editing ${file}`))
}

async function doPost(path) {
    let req = await fetch(`http://localhost:${PORT}/${path}`,{  method: 'POST', })
    return await req.json()
}

export function printUsage() {
    console.log(
`amx make  <taskname>
    make a new task
amx edit  <taskname>
      edit the task config file
amx start <taskname>
      start a task
amx stop  <taskname>
      stop a task
amx restart <taskname>
      start a task
amx info <taskname>
      show information about a task
amx log <taskname>
      print logfile for a task
amx follow <taskname>
      watch for new lines in the logfiles of the task
amx archive <taskname>
      mark task as archived so it won't be auto run. Does not actually stop it.
amx unarchive <taskname>
      mark archived task as unarchived so it can be auto run. Does not actually start it.
amx list
      list all tasks
amx stopserver
      stop the task server
amx version
      version of AMX from NPM
amx selfstatus
      print version, config, status information of AMX itself
`)
}



