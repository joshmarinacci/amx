#!/usr/bin/env node
import {getConfig, getConfigDir, getRootDir, initSetup, PORT, startServer} from './common.js'
import path from 'path'
import {default as http} from 'http'
import {default as ch} from 'child_process'
import {default as fs} from 'fs'
import {default as tail} from 'tail'
import {fileURLToPath} from 'url'
import {
    checkRunning, editTask, followTask, infoTask,
    listProcesses, logTask,
    makeTask, nuke_task,
    printUsage, printVersion, restartTask, selfStatus,
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









const commands = {
    'list': listProcesses,
    'stopserver':stopServer,
    'version':printVersion,
    'selfstatus':selfStatus,

    //create task
    'make':makeTask,

    //start and stop tasks
    'start':startTask,
    'stop':stopTask,
    'restart':restartTask,

    //monitor tasks
    'log':logTask,
    'follow':followTask,
    'info':infoTask,

    //modify task
    'edit':editTask,
    'archive':archiveTask,
    'unarchive':unarchiveTask,

    //destroy task
    'nuke':nuke_task,
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

