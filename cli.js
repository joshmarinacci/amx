#!/usr/bin/env node
import {getConfig, getConfigDir, getRootDir, initSetup, PORT, startServer} from './common.js'
import path from 'path'
import {default as http} from 'http'
import {default as ch} from 'child_process'
import {default as fs} from 'fs'
import {default as tail} from 'tail'
import {fileURLToPath} from 'url'
import {
    checkRunning, followTask, infoTask,
    listProcesses, logTask,
    makeTask, nuke_task,
    printUsage, restartTask,
    startTask,
    stopServer, stopTask
} from './src/cli_common.js'
const Tail = tail.Tail

initSetup();



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




async function printVersion() {
    let dir = path.dirname(fileURLToPath(import.meta.url))
    let data = await fs.promises.readFile(path.join(dir,'package.json'))
    info(JSON.parse(data.toString()).version)
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
    'nuke':nuke_task,
    'stop':stopTask,
    'log':logTask,
    'follow':followTask,
    'info':infoTask,
    'restart':restartTask,

    'archive':archiveTask,
    'unarchive':unarchiveTask,
    'version':printVersion,
    'edit':editTask,
    'selfstatus':selfStatus,
};

async function runCommand(args) {
    const command = args.shift()
    if (commands[command]) return await commands[command](args);
    console.log("no such command: " + command);
    return printUsage();
}


const args = process.argv.slice();
if(args.length < 3) {
    printUsage();
} else {
    args.shift();
    args.shift();
    await runCommand(args);
}

