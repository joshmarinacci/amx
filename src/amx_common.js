import fs from 'fs'

export function log() {  console.log("LOG",...arguments) }
export function info() { console.log('AMX:',...arguments) }

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


