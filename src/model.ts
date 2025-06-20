export const CONFIG_TEMPLATE = `
{
    // name of the task
    name: "unnamed task",
    
    // directory where the code is located. don't end with a /
    directory: "no_dir_specified",
    type: 'node',
    script: 'myscript.js'
}
`
export type Task = {
    name: string,
    path: string,
    running: boolean,
    pid: number,
    archived?: boolean,
}