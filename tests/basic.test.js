import {expect} from "chai"
import fs from "fs/promises"
import os from "os"
import path from "path"
import child_process from "child_process"
import {setTimeout as delay} from "timers/promises"

import {Config} from "../build/amx_common.js"
import {followTask} from "../build/cli_common.js"
import {process_exists, stop_process_tree} from "../build/util.js"

describe("followTask", function() {
    this.timeout(5000)

    /** @type {string[]} */
    let tempRoots = []
    /** @type {string} */
    let output = ""
    const originalWrite = process.stdout.write.bind(process.stdout)

    beforeEach(() => {
        output = ""
        process.stdout.write = ((chunk, encoding, callback) => {
            if (typeof encoding === "function") callback = encoding
            output += Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk)
            if (callback) callback()
            return true
        })
    })

    afterEach(async () => {
        process.stdout.write = originalWrite
        await Promise.all(tempRoots.map(root => fs.rm(root, {recursive: true, force: true})))
        tempRoots = []
    })

    it("prints newly appended stdout and stderr data with labels", async () => {
        const {config, taskname, stdoutPath, stderrPath} = await makeTestTask("follow-existing")
        await fs.writeFile(stdoutPath, "old stdout line\n")
        await fs.writeFile(stderrPath, "old stderr line\n")

        const followPromise = followTask(config, [taskname])
        await delay(50)
        await fs.appendFile(stdoutPath, "new stdout line\n")
        await fs.appendFile(stderrPath, "new stderr line\n")

        await waitFor(() => output.includes("[stdout] new stdout line") && output.includes("[stderr] new stderr line"))
        process.emit("SIGINT")
        await followPromise

        expect(output).to.include("[stdout] new stdout line")
        expect(output).to.include("[stderr] new stderr line")
        expect(output).to.not.include("old stdout line")
        expect(output).to.not.include("old stderr line")
    })

    it("starts following log files that are created after follow begins", async () => {
        const {config, taskname, stdoutPath} = await makeTestTask("follow-created-later")

        const followPromise = followTask(config, [taskname])
        await delay(50)
        await fs.writeFile(stdoutPath, "hello from stdout\n")

        await waitFor(() => output.includes("[stdout] hello from stdout"))
        process.emit("SIGINT")
        await followPromise

        expect(output).to.include("[stdout] hello from stdout")
    })

    async function makeTestTask(taskname) {
        const root = await fs.mkdtemp(path.join(os.tmpdir(), "amx-follow-"))
        tempRoots.push(root)
        const procs = path.join(root, "procs")
        const taskDir = path.join(procs, taskname)
        await fs.mkdir(taskDir, {recursive: true})
        return {
            config: new Config(root, procs),
            taskname,
            taskDir,
            stdoutPath: path.join(taskDir, "stdout.log"),
            stderrPath: path.join(taskDir, "stderr.log"),
        }
    }
})

async function waitFor(predicate, timeoutMs = 2500) {
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
        if (await predicate()) return
        await delay(20)
    }
    throw new Error("timed out waiting for expected output")
}

describe("stop_process_tree", function() {
    this.timeout(10000)

    /** @type {string[]} */
    let tempRoots = []
    /** @type {{npmPid:number, workerPid:number|null}[]} */
    let processes = []

    afterEach(async () => {
        for (const proc of processes) {
            try {
                if (proc.npmPid > 0) process.kill(-proc.npmPid, "SIGKILL")
            } catch (e) {}
            try {
                if (proc.workerPid) process.kill(proc.workerPid, "SIGKILL")
            } catch (e) {}
        }
        processes = []
        await Promise.all(tempRoots.map(root => fs.rm(root, {recursive: true, force: true})))
        tempRoots = []
    })

    it("stops an npm task's spawned worker process", async function() {
        if (process.platform === "win32") this.skip()

        const root = await fs.mkdtemp(path.join(os.tmpdir(), "amx-stop-"))
        tempRoots.push(root)
        await fs.writeFile(path.join(root, "package.json"), JSON.stringify({
            name: "amx-stop-test",
            version: "1.0.0",
            scripts: {
                something: "node launcher.js"
            }
        }, null, 2))
        await fs.writeFile(path.join(root, "worker.js"), [
            "const fs = require(\"fs\");",
            "fs.writeFileSync(\"worker.pid\", String(process.pid));",
            "setInterval(() => {}, 1000);"
        ].join("\n"))
        await fs.writeFile(path.join(root, "launcher.js"), [
            "const cp = require(\"child_process\");",
            "cp.spawn(process.execPath, [\"worker.js\"], { stdio: \"ignore\" });",
            "setInterval(() => {}, 1000);"
        ].join("\n"))

        const child = child_process.spawn("npm", ["run", "something"], {
            cwd: root,
            detached: true,
            stdio: "ignore",
        })
        child.unref()

        const npmPid = child.pid
        const workerPid = await waitForWorkerPid(root)
        processes.push({npmPid, workerPid})

        expect(process_exists(npmPid)).to.equal(true)
        expect(process_exists(workerPid)).to.equal(true)

        await stop_process_tree(npmPid)
        await waitFor(() => !process_exists(npmPid) && !process_exists(workerPid), 4000)

        expect(process_exists(npmPid)).to.equal(false)
        expect(process_exists(workerPid)).to.equal(false)
    })
})

async function waitForWorkerPid(root) {
    let workerPid = null
    await waitFor(async () => {
        try {
            const raw = await fs.readFile(path.join(root, "worker.pid"), "utf8")
            const pid = Number(raw.trim())
            if (pid > 0 && process_exists(pid)) {
                workerPid = pid
                return true
            }
        } catch (e) {}
        return false
    }, 5000)
    if (!workerPid) throw new Error("worker pid not found")
    return workerPid
}
