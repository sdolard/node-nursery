/*jslint node: true, unparam: true*/
var
util = require('util'),
task = require('../lib/task'),
helloTask = task.create({
    data: {
        host: 'localhost'
    },
    run: function(done, log, task){
        log("before hello world");
        console.log("hello world.");
        log("after hello world");
        done(new Error('foo error'));
    },
    listeners: {
        'taskstart': function (task) {
            console.log('task start: %s', task.id);
        },
        'taskresult': function (err, result, task) {
            if (err) {
                console.log('Error: %s', util.inspect(err));
                return;
            }
            console.log('task result: %s', result);
        },
        'tasklog': function (log, task) {
            console.log('task log: %s', log.msg);
        },
        'done': function (err) {
            console.log('done');
        }
    }
});
helloTask.start();