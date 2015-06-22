var http  = require('http');
var port = 45782;
http.createServer(function(req,res) {
    res.statusCode = 200;
    res.setHeader('Content-Type','text/json');
    res.write(JSON.stringify({'status':'alive'}));
    res.end();
}).listen(port, function() {
    console.log("we are up and running on port",port);
})
