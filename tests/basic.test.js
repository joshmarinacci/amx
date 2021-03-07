import {make_server} from '../src/server_code.js'
import fs from 'fs'
import chai, {expect} from "chai"
import chaiHttp from 'chai-http'
import paths from 'path'
import {initSetup} from '../common.js'
import {makeTask} from '../src/cli_common.js'
import {file_exists, read_file} from '../src/amx_common.js'
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
        let conf_path = await makeTask([taskname,taskfile])

        //verify config json on disk
        let exists = await file_exists(conf_path)
        expect(exists).to.equal(true)
        let config_json = await read_file(conf_path)
        expect(config_json.name).to.equal(taskname)
        expect(config_json.type).to.equal('node')
        expect(config_json.script).to.equal(taskfile)


        // make the server
        let server = make_server()

        //start the task
        await chai.request(server)
            .get('/start?task='+taskname)
            .then(res=>{
                console.log("START: body is",res.body)
                expect(res.status).to.equal(200)
                expect(res).to.have.header('content-type','application/json')
            })

        //confirm it's running via server listing
        await chai.request(server)
            .get('/list')
            .then(res=>{
                console.log("LIST: body is",res.body)
                expect(res.status).to.equal(200)
                expect(res).to.have.header('content-type','application/json')
                expect(res.body.tasks[0].name).to.equal(taskname)
            })

        //stop it
        await chai.request(server)
            .get('/stop?task='+taskname)
            .then(res => {
                console.log("STOP: body is",res.body)
                expect(res.status).to.equal(200)
                expect(res).to.have.header('content-type','application/json')
            })

        //confirm it's not running anymore
        await chai.request(server)
            .get('/list')
            .then(res=>{
                expect(res.status).to.equal(200)
                expect(res).to.have.header('content-type','application/json')
                expect(res.body.count).to.equal(1)
                expect(res.body.tasks[0].running).to.equal(false)
            })

        //delete it
        console.log("task config is",conf_path)
        let basedir = paths.dirname(conf_path)
        console.log('deleteing dir',basedir)
        await fs.promises.rmdir(basedir, {recursive:true})
        //confirm it's really deleted
        let dir_exists = await file_exists(basedir)
        expect(dir_exists).to.equal(false)
        //force delete if needed
        console.log("it's really deleted.")

        //stop the server
        await chai.request(server)
            .post('/stopserver')
            .then(res=>{
                console.log("done stopping")
            })

        console.log("should really be stopped now")
    })
})

