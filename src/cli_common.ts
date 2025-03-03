import {default as paths} from 'path'
import {
    CONFIG_TEMPLATE,
    getConfig,
    getConfigDir,
    getRootDir, read_task_config,
    PORT,
    startServer, write_task_config, checkTaskMissing
} from './amx_common'
import {promises as fs, createReadStream} from 'fs'
import {file_exists, info, pad} from './amx_common'
import {default as http} from 'http'
// import {Tail} from 'tail'
import {fileURLToPath} from 'url'
import {default as ch} from 'child_process'

export async function listProcesses() {
    await checkRunning()
    let data = await doGet('/list')
    let tasks:any[] = data.tasks
    if(tasks.length <= 0) return console.log("no running tasks");
    tasks.forEach(task => {
        info("task " ,
            pad(task.name,20),
            task.running?'running':'stopped',
            task.pid,
            task.archived?'archived':'active')
    });
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

export function checkRunning() {
    return new Promise((res,rej) => {
        console.log("checking if local server is running")
        const req = http.request({
                host:'localhost',
                port:PORT,
                method:'GET',
                path:'/status'},
            (response => res(response)))
        req.on('error',e=> {
            console.log("got an error",e)
            if(e.code === 'ECONNREFUSED') {
                info("can't connect to server. starting")
                try {
                    startServer();
                } catch (e) {
                    console.log("error starting the server",e)
                }
                res()
            }
        });
        req.end();
    })
}

function spawnEditor(editorpath, file) {
    const vim = ch.spawn(editorpath, [file], { stdio: 'inherit' })
    vim.on('exit', code => info(`done editing ${file}`))
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
        return new Promise((resolve,rej) => {
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



