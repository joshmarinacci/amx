import {expect} from "chai"
import fs from "fs/promises"
import os from "os"
import path from "path"
import {setTimeout as delay} from "timers/promises"

import {Config} from "../build/amx_common.js"
import {followTask} from "../build/cli_common.js"

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
        if (predicate()) return
        await delay(20)
    }
    throw new Error("timed out waiting for expected output")
}
