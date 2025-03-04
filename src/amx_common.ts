import path from 'path'
import paths from 'path'
import {fileURLToPath} from 'url'
import {default as ch} from 'child_process'
import fs from 'fs'
import {make_logger} from "josh_js_util"
import {fail, file_exists} from "./util.js";

const p = make_logger("amx_common")
export class Config {
    private root: string;
    private procs: string;

    constructor(root: string, PROCS: string) {
        this.root = root
        this.procs = PROCS
    }

    getConfigFilePath() {
        return paths.join(this.root,'config.json')
    }

    getPort() {
        return 48999;
    }

    getProcsDir() {
        return this.procs;
    }

    getTaskDir(taskname: string):string {
        return paths.join(this.getProcsDir(),taskname)
    }

    getLogFilePath() {
        return paths.join(this.root,'server.log')
    }
}
export async function init():Promise<Config> {
    if(!process.env.HOME) fail('Cannot calculate HOME')
    const HOME = process.env.HOME as string
    const root = path.join(HOME,'.amx');
    if(!fs.existsSync(root)) {
        p.info(`making root dir '${root}'`)
        fs.mkdirSync(root);
    }
    const procs = path.join(root,'procs');
    if(!fs.existsSync(procs)) {
        p.info(`making PROCS dir '${procs}'`)
        fs.mkdirSync(procs);
    }
    const file = path.join(root, 'config.json')
    if(!fs.existsSync(file)) {
        p.info(`no config found at '${file}'. Creating`)
        return new Config(root, procs)
        // config = { }
    } else {
        try {
            // config = JSON.parse(fs.readFileSync(file).toString());
            return new Config(root,procs)
        } catch (e) {
            fail(`error parsing json in file ${file}`);
        }
    }
    throw new Error("cannot start")
}

export function startServer() {
    let dirname = path.dirname(fileURLToPath(import.meta.url))
    p.info(`starting server in "${dirname}"`)
    let outlog_path = path.resolve(dirname,'out.log')
    p.info(`writing log to "${outlog_path}"`)
    const out = fs.openSync(outlog_path, 'a')
    const err = fs.openSync(outlog_path, 'a')
    let server_path = path.resolve(dirname,'server_start.js')
    // const child = ch.spawn("node",[server_path],{detached:false,
    //     stdio:['ignore',out,err]
    // })
    const child = ch.spawn("node",[server_path],{detached:true, stdio:['ignore',out,err]})
    child.unref();
}


export async function read_file(conf_path:string) {
    let info = await fs.promises.readFile(conf_path)
    return JSON.parse(info.toString())
}

export async function read_task_config(config:Config,taskname:string) {
    p.info("taskname",taskname)
    const taskdir = config.getTaskDir(taskname)
    const config_file = paths.join(taskdir, 'config.json')
    let data = await fs.promises.readFile(config_file)
    return JSON.parse(data.toString())
}

export async function write_task_config(config:Config, taskname:string, json:object) {
    const config_path = paths.join(config.getProcsDir(), taskname, 'config.json')
    await fs.promises.writeFile(config_path, JSON.stringify(json, null, "   "))
}


export function copy_object_props(src:object, dst:object) {
    for(const name in src) {
        // @ts-ignore
        dst[name] = src[name];
    }
}

export async function checkTaskMissing(config:Config, taskname:string) {
    if (!taskname) throw new Error(`No such task: "${taskname}"`)
    const task_dir = config.getTaskDir(taskname)
    let exits = await file_exists(task_dir);
    if(!exits) throw new Error(`No such task: "${taskname}"`)
    return true
}
