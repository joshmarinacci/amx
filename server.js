var common = require('./common');
var paths = require('path');
var fs    = require('fs');
var http  = require('http');
var child_process = require('child_process');

console.log("my process is",process.pid);
console.log("starting on port", common.PORT);

function ERROR(res,str) {
    console.log("ERROR",str);
    res.statusCode = 500;
    res.setHeader('Content-Type','text/json');
    res.write(JSON.stringify({status:'error','message':str}));
    res.end();
}
function SUCCESS(res,str) {
    console.log("SUCCESS",str);
    res.statusCode = 200;
    res.setHeader('Content-Type','text/json');
    res.write(JSON.stringify({status:'success','message':str}));
    res.end();
}

common.initSetup();

function listProcesses(cb) {
    child_process.exec('ps ax -o pid=',function(err,stdout,stderr){
        var lines = stdout.split('\n');
        // console.log("got a process list",lines);
        lines = lines.map(function(line) {
            return parseInt(line);
        })
        lines = lines.filter(function(line) {
            return !isNaN(line);
        })
        // console.log("got a process list",lines);
        return cb(lines);
    });
}

var handlers = {
    '/status': function(req,res) {
        // console.log("handling status");
        res.statusCode = 200;
        res.setHeader('Content-Type','text/json');
        res.write(JSON.stringify({'status':'alive'}));
        res.end();
    },
    '/list': function(req,res) {
        // console.log("doing a list");
        listProcesses(function(pids){
            res.statusCode = 200;
            console.log("pids = ", pids);
            var list = fs.readdirSync(common.getConfigDir());
            // console.log("got a list of files", list);
            res.setHeader('Content-Type','text/json');
            var tasks = list.map(function(name) {
                var dir = paths.join(common.getConfigDir(),name)
                var pidfile = paths.join(dir,'pid');
                var pidexists = fs.existsSync(pidfile);
                console.log("pidfile = ", pidfile);
                console.log("pid exists", pidexists);
                var running = false;
                var pid = -1;
                if(pidexists) {
                    pid = parseInt(fs.readFileSync(pidfile).toString());
                    console.log("loaded pid",pid);
                    if(pids.indexOf(pid)>=0) {
                        console.log("pid is running!",pids);
                        running = true;
                    }
                }
                return {
                    name:name,
                    path:dir,
                    running: running,
                    pid: pid
                }
            })
            res.write(JSON.stringify({'count':tasks.length,tasks:tasks}));
            res.end();
        });
    },
    '/stop': function(req,res) {
        var parts = require('url').parse(req.url);
        console.log("parts = ", parts);
        var query = parts.query.split('=');
        console.log("query = ", query);
        var task = query[1];
        console.log("taskname = ", task);

        console.log("need to stop a task");
        var pid = parseInt(fs.readFileSync(paths.join(common.getConfigDir(),task,'pid')).toString());
        console.log("got the pid",pid);

        listProcesses(function(pids){
            res.statusCode = 200;
            res.setHeader('Content-Type','text/json');
            if(pids.indexOf(pid)>=0) {
                console.log("it's running. must kill");
                try {
                    process.kill(pid,'SIGINT');
                    SUCCESS(res,"successfully killed " + task);
                } catch(er) {
                    ERROR(res,"error from killing " + er);
                }

            } else {
                console.log("it's not running");
                res.write(JSON.stringify({status:'failure',message:'process not running'}));
                res.end();
                return;
            }
            res.write(JSON.stringify({'status':'success','pid':pid}));
            res.end();
        });
    },
    '/start': function(req,res) {
        console.log("need to start a task");
        var parts = require('url').parse(req.url);
        console.log("parts = ", parts);
        var query = parts.query.split('=');
        console.log("query = ", query);
        var task = query[1];
        console.log("taskname = ", task);


        var taskdir = paths.join(common.getConfigDir(),task);
        if(!fs.existsSync(taskdir)) return ERROR(res,"no task found with the name " + task);

        var config_file = paths.join(taskdir,'config.json');
        var config = JSON.parse(fs.readFileSync(config_file).toString());
        console.log("running task",config);

        if(config.type != 'node') return err(res,"unknown script type " + config.type);
        if(!fs.existsSync(config.directory)) return err(res,"directory does not exist " + config.directory);

        var command = 'node';
        var cargs = [config.script];
        var stdout_log = paths.join(taskdir,'stdout.log');
        var stderr_log = paths.join(taskdir,'stderr.log');
        out = fs.openSync(stdout_log, 'a'),
        err = fs.openSync(stderr_log, 'a');
        var opts = {
            cwd:config.directory,
            detached:true,
            stdio:['ignore',out,err]
        }
        console.log('stdout going to ', stdout_log, stderr_log);
        console.log("spawning",command,cargs,opts);
        var child = child_process.spawn(command, cargs, opts);
        var pid = child.pid;
        fs.writeFileSync(paths.join(taskdir,'pid'),''+pid);

        child.on('close', function(code) {
            console.log("child has closed",code);
        });


        res.statusCode = 200;
        res.setHeader('Content-Type','text/json');
        res.write(JSON.stringify({'status':'success','pid':pid}));
        res.end();
    },
    '/stopserver':function(req,res) {
        console.log("must stop the server");
        process.exit(-1);
    }
}

http.createServer(function(req,res) {
    var parts = require('url').parse(req.url);
    console.log("parts = ", parts);
    if(handlers[parts.pathname]) return handlers[parts.pathname](req,res);
    console.log("no handler");

    res.statusCode = 200;
    res.setHeader('Content-Type','text/json');
    res.write(JSON.stringify({'status':'alive'}));
    res.end();
}).listen(common.PORT, function() {
    console.log("we are up and running");
})


return;
var PROCS = "";
var args = process.argv.slice();

args.shift();
args.shift();

if(args.length <= 0) return printUsage();


var command = args.shift();
if(command == 'make') {
    makeTask(args);
    return;
}
if(command == 'start') {
    startTask(args);
    return;
}

return printUsage();



function startTask(args) {
    var taskname = args[0];
    console.log("making the task",taskname);
    if(!taskname) return err("missing task name");

    initSetup();
    console.log("procs = ", PROCS);
    if(!fs.existsSync(paths.join(PROCS,taskname))) return err("no task found with the name " + taskname);

    var config_file = paths.join(PROCS,taskname,'config.json');
    var config = JSON.parse(fs.readFileSync(config_file).toString());
    console.log("loading",config);

    if(config.type != 'node') return err("unknown script type " + config.type);
    if(!fs.existsSync(config.directory)) return err("directory does not exist " + config.directory);

    var command = 'node';
    var cargs = [config.script];
    var opts = {
        cwd:config.directory
    }
    var stdout_log = paths.join(PROCS,taskname,'stdout.log');
    var stderr_log = paths.join(PROCS,taskname,'stderr.log');
    console.log('stdout going to ', stdout_log, stderr_log);
    console.log("spawning",command,cargs,opts);
    var ch = child_process.spawn(command, cargs, opts);
    ch.stdout.pipe(fs.createWriteStream(stdout_log));
    ch.stderr.pipe(fs.createWriteStream(stderr_log));
    ch.on('close', function(code) {
        console.log("child has closed",code);
    });

}
