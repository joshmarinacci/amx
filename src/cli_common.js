import {default as paths} from 'path'
import {getConfigDir} from '../common.js'
import {default as fs} from 'fs'

const CONFIG_TEMPLATE = {
    name:"unnamed task",
    directory:"directory of your files",
    type:'node',
    script:'myscript.js'
};

function info() { console.log('AMX:',...arguments) }

export function makeTask(args) {
    const taskname = args.shift()
    info("making the task",taskname);
    if(!taskname) return printUsage();
    const procpath = paths.join(getConfigDir(), taskname)
    if(!fs.existsSync(procpath)) fs.mkdirSync(procpath);
    info("made dir",procpath);
    const confpath = paths.join(procpath, 'config.json')
    const config = JSON.parse(JSON.stringify(CONFIG_TEMPLATE))
    config.name = taskname;

    if(args.length > 0) {
        config.script = args[0];
        config.directory = process.cwd();
    }
    console.log("generating config ",config)
    // info(JSON.stringify(config,null,'    '));
    fs.writeFileSync(confpath,JSON.stringify(config,null,'    '));

    info("edit the config file",confpath);
    info("then run: amx start ",taskname);
    return confpath
}
