console.log("this is a script that should wait forever");

var count = 0;
setInterval(function() {
    console.log("the count is ", count);
    count++;
    if(count > 10) {
        console.log("bailing");
        throw new Error();
    }
},1000);
