import {default as paths} from 'path'
import {checkTaskMissing, Config, read_task_config, startServer, write_task_config} from './amx_common.js'
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
export async function serverStatus(config:Config) {
    p.info("AMX");
    p.info("server on port ", config.getPort());
    let res = await checkRunning(config)
    p.info("result is ", res)
}

export async function makeTask(config:Config, args:string[]) {
    const taskname = args.shift()
    // info("making the task",taskname);
    if(!taskname) return printUsage();
    const task_dir = config.getTaskDir(taskname);
    if(!(await file_exists(task_dir))) await fs.mkdir(task_dir)
    const confpath = paths.join(task_dir, 'config.json')
    // const proc_config = JSON5.parse(CONFIG_TEMPLATE);
    // proc_config.name = taskname;

    // if(args.length > 0) {
    //     proc_config.script = args[0];
    //     proc_config.directory = process.cwd();
    // }
    await fs.writeFile(confpath, CONFIG_TEMPLATE)
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
    p.info(JSON.stringify(res));
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
    const errPath = paths.join(config.getProcsDir(),taskname,'stderr.log')
    const states: FollowState[] = [
        { path: outPath, position: await getInitialFollowPosition(outPath), label: 'stdout' },
        { path: errPath, position: await getInitialFollowPosition(errPath), label: 'stderr' },
    ]

    let running = true
    process.once('SIGINT', () => {
        running = false
        process.stdout.write('\n')
    })

    while (running) {
        for (const state of states) {
            await readAndPrintNewLogData(state)
        }
        await sleep(0.5)
    }
}
export async function infoTask(config:Config, args:string[]) {
    const taskname = args[0]
    await checkTaskMissing(config, taskname)
    const config_json = paths.join(config.getProcsDir(), taskname, 'config.json')
    console.log("info is",config_json)
    let req = await fetch(`http://localhost:${config.getPort()}/list`)
    const data = await req.json()
    if(data['tasks']) {
        let tasks: Task[] = data.tasks
        if (tasks.length <= 0) return p.info("no running tasks");
        let task = tasks.find(task => task.name == taskname)
        console.log("main task is",task)
        if (task && task.pid) {
            console.log(`look up ports used by ${task.pid}`)
            // `lsof -a -p PID -i}`
            let output = await exec_command(`lsof -a -p ${task.pid} -i -Fn`)
            let lines = output.split('\n')
            let port = lines.find(line => line.startsWith('n'))
            console.log(`using PORT(S): ${port?.substring(1)}`)
            let more_lines = (await exec_command(`lsof -a -p ${task.pid} -d cwd -Fn`)).split('\n')
            let cwd = more_lines[2]
            // console.log("more lines", more_lines[2])
            console.log(`cwd is ${cwd.substring(1)}`)

        }
    }
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


async function exec_command(cmd:string):Promise<string> {
    return  new Promise((resolve,reject) => {
        ch.exec(cmd,(err,stdout)=>{
            if(err) reject(err)
            resolve(stdout)
        })
    })
}
async function which_command(cmd:string):Promise<[string,number]> {
    return new Promise((res,rej)=>{
        ch.exec(`which ${cmd}`,(err,stdout,stderr) => {
            //@ts-ignore
            if(err) res([stderr,err])
            res([stdout.trim(),0])
        })
    })
}

export async function checkRunning(config: Config) {
    try {
        let res = await fetch(`http://localhost:${config.getPort()}/status`)
        return await res.json()
    } catch (e) {
        p.info("server doesn't seem to be running. lets start it")
        startServer()
        await sleep(1)
        return await checkRunning(config)
    }
}

function spawnEditor(editorpath:string, file:string) {
    const vim = ch.spawn(editorpath, [file], { stdio: 'inherit' })
    vim.on('exit', code => p.info(`done editing ${file}`))
}

async function doPost(config:Config, path:string) {
    let req:Response = await fetch(`http://localhost:${config.getPort()}/${path}`,{  method: 'POST', })
    return await req.json()
}

type FollowState = {
    path: string
    position: number
    label: string
}

async function getInitialFollowPosition(path:string):Promise<number> {
    if (!(await file_exists(path))) return 0
    const stat = await fs.stat(path)
    return stat.size
}

async function readAndPrintNewLogData(state:FollowState):Promise<void> {
    if (!(await file_exists(state.path))) return
    const stat = await fs.stat(state.path)
    if (stat.size < state.position) {
        state.position = stat.size
        return
    }
    if (stat.size === state.position) return

    const file = await fs.open(state.path, 'r')
    try {
        const length = stat.size - state.position
        const buffer = new Uint8Array(length)
        const {bytesRead} = await file.read(buffer, 0, length, state.position)
        if (bytesRead > 0) {
            const chunk = new TextDecoder().decode(buffer.subarray(0, bytesRead))
            process.stdout.write(prefixLogChunk(state.label, chunk))
            state.position += bytesRead
        }
    } finally {
        await file.close()
    }
}

function prefixLogChunk(label:string, chunk:string):string {
    const prefix = `[${label}] `
    const parts = chunk.split('\n')
    return parts.map((part, index) => {
        if (index === parts.length - 1 && part === '') return ''
        return prefix + part
    }).join('\n')
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
      print version, config, status information of the AMX cli itself
amx serverstatus
      print status of the AMX server      
`)
}
