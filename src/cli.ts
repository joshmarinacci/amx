#!/usr/bin/env node

import {
    archiveTask, Command,
    editTask,
    followTask,
    infoTask,
    listProcesses,
    logTask,
    makeTask,
    nuke_task,
    printUsage,
    printVersion,
    restartTask,
    selfStatus, serverStatus,
    startTask,
    stopServer,
    stopTask,
    unarchiveTask
} from './cli_common.js'
import {make_logger} from "josh_js_util";
import {init} from "./amx_common.js";

const log = make_logger("CLI")

const config = await init()

const commands:Record<string, Command> = {
    'list': listProcesses,
    'stopserver':stopServer,
    'version':printVersion,
    'selfstatus':selfStatus,
    'serverstatus':serverStatus,

    //create task
    //@ts-ignore
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

async function runCommand(args:string[]) {
    const command = args.shift()
    try {
        if (command && commands[command]) return await commands[command](config,args);
        return printUsage();
    } catch (e) {
        // @ts-ignore
        log.error(e.message)
    }
}


const args = process.argv.slice();
if(args.length < 3) {
    printUsage();
} else {
    args.shift();
    args.shift();
    await runCommand(args);
}

