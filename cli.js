#!/usr/bin/env node
import {initSetup} from './common.js'
import {
    archiveTask,
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
    selfStatus,
    startTask,
    stopServer,
    stopTask,
    unarchiveTask
} from './src/cli_common.js'

initSetup();

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
    try {
        if (commands[command]) return await commands[command](args);
        return printUsage();
    } catch (e) {
        console.log("error")
        console.error(e)
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

