export const CONFIG_TEMPLATE = {
    name: "unnamed task",
    directory: "no_dir_specified",
    type: 'node',
    script: 'myscript.js'
};
export type Task = {
    name: string,
    path: string,
    running: boolean,
    pid: number,
    archived?: boolean,
}