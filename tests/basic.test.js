import {make_server} from '../src/server_code.js'
import fs from 'fs'
import chai, {expect} from "chai"
import chaiHttp from 'chai-http'
import paths from 'path'
import {initSetup} from '../common.js'
import {makeTask} from '../src/cli_common.js'
chai.use(chaiHttp)

describe('silly.io test',() => {
    it('should get the status page',  (done) => {
    chai.request('http://api.silly.io')
        .get('/')
        .end((err,res)=>{
            expect(res.status).to.equal(200)
            // res.body.should.be({'status':'ok'})
            done()
        })
    })
})

async function file_exists(conf_path) {
    try {
        let info = await fs.promises.stat(conf_path)
        return true
    } catch (e) {
        return false
    }
}

async function read_file(conf_path) {
    let info = await fs.promises.readFile(conf_path)
    return JSON.parse(info)
}

describe("test local server",() => {
    initSetup()
    /*
    it("should get the status page",(done) => {
        chai.request(make_server())
            .get('/status')
            .end((err,res)=>{
                expect(res.status).to.equal(200)
                expect(res).to.have.header('content-type','application/json')
                expect(res.body).to.have.property('status','alive')
                done()
            })
    })
    it('should list the processes',(done) => {
        chai.request(make_server())
            .get('/list')
            .end((err,res)=>{
                expect(res.status).to.equal(200)
                expect(res).to.have.header('content-type','application/json')
                expect(res.body.count).to.equal(0)
                done()
            })
    })
     */
    //make a proc
    it('it should make a proc',async () => {
        //make a new task
        const taskname = 'test1'
        const taskfile = "tests/testserver1/start.js"
        let conf_path = makeTask([taskname,taskfile])

        //verify config json on disk
        let exists = await file_exists(conf_path)
        expect(exists).to.equal(true)
        let config_json = await read_file(conf_path)
        expect(config_json.name).to.equal(taskname)
        expect(config_json.type).to.equal('node')
        expect(config_json.script).to.equal(taskfile)


        let server = make_server()
            // doPost("/start?task="+taskname).then(res => console.log(res))
        //start it
        await chai.request(server)
            .get('/start?task='+taskname)
            .then(res=>{
                expect(res.status).to.equal(200)
                expect(res).to.have.header('content-type','application/json')
                console.log("server started it")
            })

        //confirm it's running via server listing
        await chai.request(server)
            .get('/list')
            .then(res=>{
                expect(res.status).to.equal(200)
                expect(res).to.have.header('content-type','application/json')
                console.log("the list is",res.body)
                expect(res.body.tasks[0].name).to.equal(taskname)
            })

        //stop it
        await chai.request(server)
            .get('/stop?task='+taskname)
            .then(res => {
                expect(res.status).to.equal(200)
                expect(res).to.have.header('content-type','application/json')
                console.log("server stopped it",res.body)
            })

        //confirm it's not running anymore
        await chai.request(server)
            .get('/list')
            .then(res=>{
                expect(res.status).to.equal(200)
                expect(res).to.have.header('content-type','application/json')
                console.log("the list is",res.body)
                expect(res.body.count).to.equal(1)
                expect(res.body.tasks[0].running).to.equal(false)
            })
        //delete it
        console.log("task config is",conf_path)
        let basedir = paths.dirname(conf_path)
        console.log('basedir is',basedir)
        await fs.promises.rmdir(conf_path, {recursive:true})
        //confirm it's really deleted
        let dir_exists = await file_exists(conf_path)
        expect(dir_exists).to.equal(false)
        //force delete if needed
        console.log("it's really deleted.")
    })
})

