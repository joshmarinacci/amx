import {default as paths} from 'path'
import {getConfigDir} from '../common.js'
import {promises as fs} from 'fs'
import {file_exists, info} from './amx_common.js'

const CONFIG_TEMPLATE = {
    name:"unnamed task",
    directory:"directory of your files",
    type:'node',
    script:'myscript.js'
};

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
    // info(JSON.stringify(config,null,'    '));
    await fs.writeFile(confpath,JSON.stringify(config,null,'    '));

    info("edit the config file",confpath);
    info("then run: amx start ",taskname);
    return confpath
}


export function printUsage() {
    console.log("amx make  <taskname>");
    console.log("      make a new task")
    console.log("amx edit  <taskname>");
    console.log("      edit the task config file");
    console.log("amx start <taskname>");
    console.log("      start a task")
    console.log("amx stop  <taskname>");
    console.log("      stop a task")
    console.log("amx restart <taskname>");
    console.log("      start a task")
    console.log("amx info <taskname>");
    console.log("      show information about a task");
    console.log("amx log <taskname>");
    console.log("      print logfile for a task");
    console.log("amx follow <taskname>");
    console.log("      watch for new lines in the logfiles of the task");
    console.log("amx archive <taskname>");
    console.log("      mark task as archived so it won't be auto run. Does not actually stop it.");
    console.log("amx unarchive <taskname>");
    console.log("      mark archived task as unarchived so it can be auto run. Does not actually start it.");
    console.log("amx list");
    console.log("      list all tasks")
    console.log("amx stopserver");
    console.log("      stop the task server")
    console.log("amx version");
    console.log("      version of AMX from NPM")
    console.log("amx selfstatus");
    console.log("      print version, config, status information of AMX itself")
}
