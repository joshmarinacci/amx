# AMX

AMX is a process and task runner/automator written in Node JS. It's designed
to be super easy to use, and requires no external dependencies.

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

Then edit the config file in `~/.amx/procs/taskname/config.json`
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
Run `amx log taskname` to view the current stdout log.


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

