import path from 'path'
import {fileURLToPath} from 'url'
import {default as ch} from 'child_process'
import fs from 'fs'
import paths from 'path'

export const CONFIG_TEMPLATE = {
    name:"unnamed task",
    directory:"no_dir_specified",
    type:'node',
    script:'myscript.js'
};

let PROCS
let root
let config
export const initSetup = function() {
    if(!process.env.HOME) throw new Error("can't calculate HOME");
    const HOME = process.env.HOME
    root = path.join(HOME,'.amx');
    if(!fs.existsSync(root)) fs.mkdirSync(root);
    PROCS = path.join(root,'procs');
    if(!fs.existsSync(PROCS)) fs.mkdirSync(PROCS);

    const file = path.join(root, 'config.json')
    if(!fs.existsSync(file)) {
        config = { }
    } else {
        try {
            config = JSON.parse(fs.readFileSync(file).toString());
        } catch (e) {
            console.log("error parsing json in file", file);
            process.exit(-1);
        }
    }
};
export const getConfigDir = function() {
    return PROCS;
};
export const getRootDir = function() {
    return root;
};

export const getConfig = function() {
    return config;
};


export const PORT = 48999;


export function startServer() {
    let dirname = path.dirname(fileURLToPath(import.meta.url))
    let outlog_path = path.resolve(dirname,'out.log')
    console.log('log path',outlog_path)
    const out = fs.openSync(outlog_path, 'a')
    const err = fs.openSync(outlog_path, 'a')
    let server_path = path.resolve(dirname,'server_start.js')
    console.log("server path",server_path)
    const child = ch.spawn("node",[server_path],{detached:true, stdio:['ignore',out,err]})
    child.unref();
}


export function log() {  console.log("LOG",...arguments) }
export function info() { console.log(...arguments) }

export async function file_exists(conf_path) {
    try {
        let info = await fs.promises.stat(conf_path)
        return true
    } catch (e) {
        return false
    }
}

export async function read_file(conf_path) {
    let info = await fs.promises.readFile(conf_path)
    return JSON.parse(info)
}

export async function sleep(delay) {
    return new Promise((res,rej)=>{
        setTimeout(()=>{
            res()
        },delay)
    })
}

export function pad(str,n) {
    if(!str) return spaces(n);
    if(str.length < n) return str + spaces(n-str.length);
    return str;
}

export function spaces(n) {
    let str = "";
    for(let i=0; i<n; i++) {
        str +=' ';
    }
    return str;
}

export async function read_task_config(taskname) {
    const taskdir = paths.join(getConfigDir(), taskname)
    const config_file = paths.join(taskdir, 'config.json')
    let data = await fs.promises.readFile(config_file)
    return JSON.parse(data.toString())
}

export async function write_task_config(taskname, json) {
    const config_path = paths.join(getConfigDir(), taskname, 'config.json')
    await fs.promises.writeFile(config_path, JSON.stringify(json, null, "   "))
}

export function copy_object_props(src, dst) {
    for(const name in src) {
        dst[name] = src[name];
    }
}

export async function checkTaskMissing(taskname) {
    if (!taskname) throw new Error(`No such task: "${taskname}"`)
    const path = paths.join(getConfigDir(), taskname)
    let exits = await file_exists(path);
    if(!exits) throw new Error(`No such task: "${taskname}"`)
    return true
}
