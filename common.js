import {default as paths} from 'path'
import {default as fs} from 'fs'
import {fileURLToPath} from 'url'
import {default as ch} from 'child_process'

let PROCS
let root
let config
export const initSetup = function() {
    if(!process.env.HOME) throw new Error("can't calculate HOME");
    const HOME = process.env.HOME
    root = paths.join(HOME,'.amx');
    if(!fs.existsSync(root)) fs.mkdirSync(root);
    PROCS = paths.join(root,'procs');
    if(!fs.existsSync(PROCS)) fs.mkdirSync(PROCS);

    const file = paths.join(root, 'config.json')
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
    let dirname = fileURLToPath(import.meta.url)
    console.log('starting the server ', dirname)
    let outlog_path = paths.relative(dirname,'out.log')
    console.log('log path',outlog_path)
    const out = fs.openSync(outlog_path, 'a')
    const err = fs.openSync(outlog_path, 'a')
    let server_path = paths.relative(dirname,'server.js')
    console.log("server path",server_path)
    const child = ch.spawn("node",[server_path],{detached:true, stdio:['ignore',out,err]})
    child.unref();
}
