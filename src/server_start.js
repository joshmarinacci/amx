import {getConfig, getRootDir, initSetup, PORT} from '../common.js'

import {join} from 'path'
import fs from 'fs'
import {log, sleep} from './amx_common.js'
import {make_server} from './server_code.js'

initSetup();

const config = getConfig()
log("config is",config);

let server = make_server()
server.listen(PORT, function() {
    log("we are up and running");
});
await sleep(2000)
console.log("server running")
