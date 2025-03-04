import {init} from './amx_common.js'
import {make_server} from './server_code.js'
import {sleep} from "./util.js";
import {make_logger} from "josh_js_util";

const log = make_logger("SERVER_START")

const config = await init()
log.info("config is",config);

let server = make_server()
server.listen(config.getPort(), function() {
    log.info("we are up and running");
});
await sleep(1000)
log.info("server running")
