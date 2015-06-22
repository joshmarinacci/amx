# amx

AMX is a process and task runner/automator written in Node JS. It's designed
to be super easy to use, and requires no external dependencies.

# Getting started

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
