var 
task = require('../lib/task'),
helloTask = task.create({
    action: function(id, config, taskDone, log){
        log("before hello world");
        console.log("hello world.");
        log("after hello world");
        taskDone();
    },
    config: {
        host: 'localhost'
    },
    on: {
        'taskstart': function (err, config, response, task) {
            console.log('task start');
        },
        'taskresult': function (err, config, response, task) {
            console.log('task result');
        },
        'tasklog': function (err, config, response, task) {
            console.log('task log');
        },
        'done': function (err, config, response, task) {
            console.log('done');
        }
    }
});
debugger;
helloTask.run();