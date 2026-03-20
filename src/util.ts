import fs from "fs";
import {LoggerEvent, LoggerOutput} from "josh_js_util/dist/log.js";

export async function file_exists(conf_path: string) {
    try {
        let info = await fs.promises.stat(conf_path)
        return true
    } catch (e) {
        return false
    }
}

export async function sleep(delay: number):Promise<void> {
    return new Promise((res, rej) => {
        setTimeout(() => {
            res()
        }, delay)
    })
}

export function process_exists(pid:number):boolean {
    if (!Number.isInteger(pid) || pid <= 0) return false
    try {
        process.kill(pid, 0)
        return true
    } catch (e:any) {
        return e?.code === 'EPERM'
    }
}

export async function stop_process_tree(pid:number):Promise<boolean> {
    if (!process_exists(pid)) return false

    const targets = process.platform === 'win32' ? [pid] : [-pid, pid]
    await signal_process_targets(targets, 'SIGINT')
    if (!(await wait_for_process_exit(pid, 1000))) {
        await signal_process_targets(targets, 'SIGTERM')
        if (!(await wait_for_process_exit(pid, 1000))) {
            await signal_process_targets(targets, 'SIGKILL')
            await wait_for_process_exit(pid, 1000)
        }
    }

    return true
}

async function wait_for_process_exit(pid:number, timeout_ms:number):Promise<boolean> {
    const started = Date.now()
    while (Date.now() - started < timeout_ms) {
        if (!process_exists(pid)) return true
        await sleep(100)
    }
    return !process_exists(pid)
}

async function signal_process_targets(targets:number[], signal:NodeJS.Signals):Promise<void> {
    for (const target of targets) {
        try {
            process.kill(target, signal)
            return
        } catch (e:any) {
            if (e?.code === 'ESRCH') continue
            if (e?.code === 'EINVAL') continue
            if (e?.code === 'EPERM') return
            throw e
        }
    }
}

export function pad(str: string, n: number): string {
    if (!str) return spaces(n);
    if (str.length < n) return str + spaces(n - str.length);
    return str;
}

export function spaces(n: number): string {
    let str = "";
    for (let i = 0; i < n; i++) {
        str += ' ';
    }
    return str;
}

export function fail(cannotCalculateHOME: string) {
    console.error('ERROR:', cannotCalculateHOME)
    process.exit(1)
}

export class FileLoggerOutput implements LoggerOutput {
    private file: string;
    constructor(file: string) {
        this.file = file
        fs.appendFileSync(this.file, "starting log")
    }

    log(evt: LoggerEvent): void {
        try {
            fs.appendFileSync(this.file, `${evt.prefix}:${evt.priority} ${evt.message} ${evt.args}`);
        } catch (e) {
            fs.appendFileSync(this.file, `crash ${e}`)
        }
    }
}
