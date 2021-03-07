import path from 'path'
import {default as fs} from 'fs'
import {fileURLToPath} from 'url'
import {default as ch} from 'child_process'

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
    console.log('dirname is ', dirname)
    let outlog_path = path.relative(dirname,'out.log')
    console.log('log path',path.resolve(outlog_path))
    const out = fs.openSync(outlog_path, 'a')
    const err = fs.openSync(outlog_path, 'a')
    let server_path = path.relative(dirname,'src/server_start.js')
    console.log("server path",path.resolve(server_path))
    const child = ch.spawn("node",[server_path],{detached:true, stdio:['ignore',out,err]})
    child.unref();
    console.log("spanwed the server")
}
