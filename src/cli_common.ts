import {default as paths} from 'path'
import {
    checkTaskMissing, Config,
    read_task_config,
    startServer,
    write_task_config
} from './amx_common.js'
import {createReadStream, promises as fs} from 'fs'
import {fileURLToPath} from 'url'
import {default as ch} from 'child_process'
import {make_logger, sleep} from "josh_js_util";
import {CONFIG_TEMPLATE, Task} from "./model.js";
import {file_exists, pad} from "./util.js";
const p = make_logger('CLI_COMMON')


export async function listProcesses(config:Config): Promise<void> {
    await checkRunning(config)
    let req = await fetch(`http://localhost:${config.getPort()}/list`)
    const data = await req.json()
    if(data['tasks']) {
        let tasks: Task[] = data.tasks
        if (tasks.length <= 0) return p.info("no running tasks");
        tasks.forEach(task => {
            console.log("task ",
                pad(task.name, 20),
                task.running ? 'running' : 'stopped',
                task.pid,
                task.archived ? 'archived' : 'active')
        });
    }
}

export type Command = (config:Config, args:string[]) => Promise<void>


export async function stopServer(config:Config): Promise<void> {
    await checkRunning(config)
    let data = await doPost(config,'stopserver')
}
export async function printVersion(config:Config) {
    let dir = paths.dirname(fileURLToPath(import.meta.url))
    let data = await fs.readFile(paths.join(dir,'..','package.json'))
    p.info(JSON.parse(data.toString()).version)
}
export async function selfStatus(config:Config) {
    p.info("AMX");
    await printVersion(config);
    p.info("Config", config.getConfigFilePath());
    // p.info(JSON.stringify(getConfig(),null,'    '));
    p.info("server on port ", config.getPort());
    p.info("process descriptions", config.getProcsDir());
}

export async function makeTask(config:Config, args:string[]) {
    const taskname = args.shift()
    // info("making the task",taskname);
    if(!taskname) return printUsage();
    const task_dir = config.getTaskDir(taskname);
    if(!(await file_exists(task_dir))) await fs.mkdir(task_dir)
    const confpath = paths.join(task_dir, 'config.json')
    const proc_config = JSON.parse(JSON.stringify(CONFIG_TEMPLATE))
    proc_config.name = taskname;

    if(args.length > 0) {
        proc_config.script = args[0];
        proc_config.directory = process.cwd();
    }
    await fs.writeFile(confpath,JSON.stringify(proc_config,null,'    '));
    p.info("edit the config file",confpath);
    p.info("then run: amx start ",taskname);
    return confpath
}

export async function startTask(config:Config, args:string[]) {
    const taskname = args[0]
    p.info("startTask",taskname)
    await checkTaskMissing(config, taskname)
    p.info(`starting the task '${taskname}'`)
    let res = await doPost(config, "start?task="+taskname)
    p.info(res)
}
export async function stopTask(config:Config, args:string[]) {
    const taskname = args[0]
    await checkTaskMissing(config, taskname)
    p.info(`stopping the task '${taskname}'`);
    let res = await doPost(config, "stop?task="+taskname)
    p.info(res)
}
export async function restartTask(config:Config, args:string[]) {
    const taskname = args[0]
    await checkTaskMissing(config, taskname)
    p.info(`restarting the task ${taskname}`);
    let res = await doPost(config, "restart?task="+taskname)
    p.info(res)
}

export async function logTask(config:Config, args:string[]) {
    const taskname = args[0]
    await checkTaskMissing(config, taskname)
    const logPath = paths.join(config.getProcsDir(),taskname,'stdout.log')
    p.info("looking at",logPath)
    if(await file_exists(logPath)) createReadStream(logPath).pipe(process.stdout);

    const errPath = paths.join(config.getProcsDir(),taskname,'stderr.log')
    if(await file_exists(errPath)) createReadStream(errPath).pipe(process.stdout);
}
export async function followTask(config:Config, args:string[]) {
    const taskname = args[0]
    await checkTaskMissing(config, taskname)
    const outPath = paths.join(config.getProcsDir(),taskname,'stdout.log')
    if(! (await file_exists(outPath))) return
    const errPath = paths.join(config.getProcsDir(),taskname,'stderr.log')
    if(!(await file_exists(errPath))) return
    // const stdoutTail = new Tail(outPath)
    // stdoutTail.on('line', (data) => console.log(data))
    // stdoutTail.on('error', (data) => console.log('ERROR:',data))
    // const stderrTail = new Tail(errPath)
    // stderrTail.on('line', (data) => console.log(data))
    // stderrTail.on('error', (data) => console.log('ERROR:',data))
}
export async function infoTask(config:Config, args:string[]) {
    const taskname = args[0]
    await checkTaskMissing(config, taskname)
    const config_json = paths.join(config.getProcsDir(), taskname, 'config.json')
    createReadStream(config_json).pipe(process.stdout);
}

export async function editTask(config:Config, args:string[]) {
    const taskname = args[0]
    if(!taskname) return console.log("ERROR: missing taskname");
    await checkTaskMissing(config, taskname)
    const config_file = paths.join(config.getProcsDir(), taskname, 'config.json')
    if(process.env.EDITOR) return spawnEditor(process.env.EDITOR,config_file);
    //detect location of pico
    let [stdout_pico, pico] = await which_command('pico')
    if(pico === 0) return spawnEditor(stdout_pico,config_file)
    let [stdout_vi, vi] = await which_command('vi')
    if(vi === 0) return spawnEditor(stdout_vi,config_file)
    return console.log("no valid editor not found. please set the EDITOR variable");
}
export async function archiveTask(config:Config, args:string[]) {
    const taskname = args[0]
    p.info(`archiving the task ${taskname}`)
    await checkTaskMissing(config, taskname)
    let json = await read_task_config(config, taskname)
    json.archived = true
    await write_task_config(config, taskname,json)
    console.log("wrote out", await read_task_config(config, taskname))
}
export async function unarchiveTask(config:Config, args:string[]) {
    const taskname = args[0]
    p.info(`archiving the task ${taskname}`)
    await checkTaskMissing(config, taskname)
    let json = await read_task_config(config, taskname)
    json.archived = false
    await write_task_config(config, taskname,json)
    console.log("wrote out", await read_task_config(config, taskname))
}

export async function nuke_task(config:Config, args:string[]) {
    const taskname = args[0]
    const taskname2 = args[1]
    if(!taskname || taskname !== taskname2) return console.log("you must type the name twice to nuke a task")
    await stopTask(config,[taskname])
    p.info("fully stopped")
    let task_dir = config.getTaskDir(taskname)
    p.info("nuking ", task_dir)
    await fs.rmdir(task_dir, {recursive:true})
}


async function which_command(cmd:string):Promise<[string,number]> {
    return new Promise((res,rej)=>{
        ch.exec(`which ${cmd}`,(err,stdout,stderr) => {
            if(err) res([stderr,err])
            res([stdout.trim(),0])
        })
    })
}

export async function checkRunning(config: Config) {
    try {
        await fetch(`http://localhost:${config.getPort()}/status`)
    } catch (e) {
        p.info("server doesn't seem to be running. lets start it")
        startServer()
        await sleep(1)
    }
}

function spawnEditor(editorpath:string, file:string) {
    const vim = ch.spawn(editorpath, [file], { stdio: 'inherit' })
    vim.on('exit', code => p.info(`done editing ${file}`))
}

async function doPost(config:Config, path:string) {
    let req = await fetch(`http://localhost:${config.getPort()}/${path}`,{  method: 'POST', })
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



