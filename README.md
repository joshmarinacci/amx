# AMX

AMX is a process and task runner written in Node.js. It provides a small CLI
and a local background server for starting, stopping, listing, and inspecting
named tasks.

# NOTE

AMX supports three task types:

- `node` to run a Node.js script
- `npm` to run an npm script
- `exe` to run a native executable



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
amx nuke taskname taskname
```

This will stop the task if running, then delete the task directory.


# View task log

All tasks log their output to `~/.amx/procs/<taskname>/stdout.log` and `stderr.log`. 
Run `amx log taskname` to print the current stdout and stderr logs.




# Edit task's config

```
amx edit taskname
```

This will open up your preferred command line editor as specified by the EDITOR environment variable.

# Change the script type

set type to `node` for nodejs scripts. set it to `npm` to run a script through npm. set it to `exe`
for a native binary. For example the following is equivalent to `npm run build`

```json
{
   "name": "my-task",
   "directory":"some-dir",
   "type": "npm",
   "script": "build"
}
``` 

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



# archive a task

Run `amx archive taskname` to mark a task as archived. If the task was already running you will still need to stop it as well.

# un-archive a task

Run `amx unarchive taskname` to mark a task as not archived. If the task was stopped you will still need to start it as well.


# How it works

AMX actually has two components: the command line interface and a server process. The server
will be started automatically if it's not already running when you execute the command line interface.
The server listens on a local HTTP port, launches configured tasks as detached child processes,
stores their PIDs in the task directory, and writes process output to log files.


# get status of AMX itself


```
amx selfstatus

AMX
0.0.11
Config /Users/josh/.amx/config.json
server on port  48999
process descriptions /Users/josh/.amx/procs
```


# update AMX to a new version

```
npm install -g amx
```
