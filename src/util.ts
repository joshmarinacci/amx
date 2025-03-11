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
