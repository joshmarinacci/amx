# AMX

AMX is a process and task runner/automator written in Node JS. It's designed
to be super easy to use, and requires no external dependencies,
except nodemailer for sending email alerts.

# NOTE

Currently AMX only supports tasks written in Node. In the future it will support other arbitrary scripts.



# Getting started

Install AMX with
```
npm install -g amx
```

If you are on Linux this command may fail because you aren't root. *Do not install AMX as root*.
If you install AMX as root then all of your services will run as root as well. Instead
change the global npm directory as described in the node docs
[here](https://docs.npmjs.com/getting-started/fixing-npm-permissions).



Make a new task with:

```
amx make <taskname>
```

Then edit the config file in `~/.amx/procs/taskname/config.json`,
or with `amx edit <taskname>`,
to set the directory and script to run. For example,
to run the program `server.js` in `/home/me/radcode/`,
run `amx make radserver` then
edit the config file to look like this
```
{
    "name":"radserver",
    "directory":"/home/me/radcode",
    "type":"node",
    "script":"server.js"
}
```

Now start it with

```
amx start radserver
```

and stop it with

```
amx stop radserver
```

List all running processes with

```
amx list
```

# Remove a task

```
amx remove taskname
```

This will stop the task if running, then delete the config files


# View task log

All tasks log their output to `~/.amx/procs/<taskname>/stdout.log` and `stderr.log`. 
Run `amx log taskname` to view the current stdout log.  Run `amx follow taskname` to 
wait and continuually show new log output from both stdout and stderr.




# Edit task's config

```
amx edit taskname
```

This will open up your preferred command line editor as specified by the EDITOR environment variable.

# Change the script type

set type to `node` for nodejs scripts. set it to `npm` to run a script through npm. set it to `exe`
for a native binary.

# Set command line arguments

set args to an array of strings. ex:

``` json
{
  "args": ["--foo", "--bar", "baz.out"]
}

```

# Set Environment Variables


set the env property in the config file. ex:

```
{
   "env" : {
       "SECRET_KEY":"my_special_secret",
       "FOO_HOME":"/some/path/to/foo"
   }
}
```

Now these variable can be accessed from inside the script
with `process.env.SECRET_KEY`, etc.



# Monitor a git hub repo

Run `amx make taskname` to create the task. Then edit it like this:

```
{
   "watch-repo": {
        "webhook-id":"somekey",
        "repo":"https://github.com/joshmarinacci/cool.git"
        "event":"push",
   }
}
```

event push will make it check out and update on every 'push' event.

Code will be checked out to the 'directory' directory.





# Shortcuts

Make a new task for a node script in one step.
```
cd myproject
amx make proj1 start.js
amx start proj1
```

If you provide a filepath after the task name AMX will assume it is a node script and fill
in the `directory` and `type` and `script` fields of the config file for you.

# How it works

AMX actually has two components: the command line interface and a server process. The server
will be started automatically if it's not already running when you execute the commandline interface.
The server will monitor the running tasks and restart them if they crash.  If a task needs
to be restarted more than 5 times in 60 seconds then AMX will disable it.


# Send Email Alerts

To have AMX send emails whenever a process stops simply create or edit `~.amx/config.json`

```
{
   "alerts": {
        "email":{
           "transport":"smtps://me%40mydomain.com:somepassword@smtp.gmail.com",
           "to":"my@mydomain.com",
           "from":"amx@myotherdomain.com"
        }
   }
}
```

The `transport` parameter is a URL which will be passed to [nodemailer](https://nodemailer.com)
to send an email.  Note that you must escape the @ sign as %40 and if you use gmail you
probably need to generate a new application specific password.


# get status of AMX itself


```
amx selfstatus

AMX
0.0.11
Config /Users/josh/.amx/config.json
{
    "alerts": {
        "email": {
            "transport": "smtps://user%40domain:password@smtp.gmail.com",
            "from": "\"amx\" <amx@npmjs.com>",
            "to": "username@domain.tld"
        }
    }
}
server on port  48999
process descriptions /Users/josh/.amx/procs
```

