/*
Copyright ©2014 by Sebastien Dolard (sdolard@gmail.com)
*/
/*jslint node: true, unparam: true */

var
assert = require('assert'),
domain = require('domain'),
Task = require('../lib/task');

function unused(a) {return;}

describe('task', function(){
	it ('should have a run config', function(done){
		var d = domain.create();
		d.on('error', function(e) {
		 	if (e.code === 'EUNDEFINEDRUN') {
				done();
			}
		});
		d.run(function(){
			unused(new Task());
		});
	});

	it ('should have a run function config', function(done){
		var d = domain.create();
		d.on('error', function(e) {
		 	if (e.code === 'EINVALIDRUN') {
				done();
			}
		});
		
		d.run(function(){
			unused(new Task({
				run: 5
			}));
		});

	});

	it ('should call taskstart event', function(done){
		var aTask = new Task({
			run: function (done) {
				done();
			},
			listeners: {
				'taskstart': function() {
					done();
				}
			}
		});
		aTask.start();
	});

	it ('should autostart', function(done){
		unused(new Task({
			autostart: true,
			run: function (done) {
				done();
			},
			listeners: {
				'taskstart': function() {
					done();
				}
			}
		}));
	});

	it ('should not autostart', function(done){
		var aTask = new Task({
			autostart: false,
			run: function () {
				return;
			}
		});
		assert(aTask.state === 'neverstarted');
		done();
	});

	it ('should log', function(done){
		unused(new Task({
			autostart: true,
			run: function (done, log) {
				log('a task log');
			},
			listeners: {
				'tasklog': function(log) {
					assert(log.msg === 'a task log');
					assert(log.msDuration >= 0);
					assert(log.date instanceof Date);
					done();
				}
			}
		}));
	});

	it ('should return a result', function(done){
		unused(new Task({
			autostart: true,
			run: function (done) {
				done(5);
			},
			listeners: {
				'taskresult': function(err, result) {
					assert(err === undefined);
					assert(result.data === 5);
					done();
				}
			}
		}));
	});

	it ('should return a Error', function(done){
		unused(new Task({
			autostart: true,
			run: function (done) {
				done(new Error('This is an error'));
			},
			listeners: {
				'taskresult': function(err, result) {
					assert(err instanceof Error);
					assert(err.message === 'This is an error');
					assert(result === undefined);
					done();
				}
			}
		}));
	});

	it ('should call done event', function(done){
		unused(new Task({
			autostart: true,
			run: function (done) {
				done();
			},
			listeners: {
				'done': function() {
					done();
				}
			}
		}));
	});

	it ('should call start, then log, result and done', function(done){
		var steps = {
			start: 0,
			log: 1,
			result : 2,
			done: 3
		},
		step = 0;
		unused(new Task({
			autostart: true,
			run: function (done, log) {
				log('foo');
				done(10);
			},
			listeners: {
				'taskstart': function() {
					assert(this.state === 'started');
					assert(steps.start === step);
					step++;
				},
				'tasklog': function(log) {
					assert(log.msg === 'foo');
					assert(steps.log === step);
					step++;
				},
				'taskresult': function(err, result) {
					assert(this.state === 'result');
					assert(result.data === 10);
					assert(steps.result === step);
					step++;
				},
				'done': function() {
					assert(this.state === 'done');
					assert(steps.done === step);
					done();
				}
			}
		}));
	});

	it ('should timeout', function(done){
		unused(new Task({
			autostart: true,
			timeout: 10, // ms
			run: function (done, log) {
				return;
			},
			listeners: {
				'taskresult': function(err) {
					assert(err.message === 'Task timeouted');
					assert(err.code === 'ETASKTIMEOUTED');
					assert(err.msDuration >= 10);
					done();
				}
			}
		}));
	});

	it ('should timeout before run timeout', function(done){
		unused(new Task({
			autostart: true,
			timeout: 1, // ms
			run: function (taskDone) {
				setTimeout(function() {
					taskDone();
				}, 200);
			},
			listeners: {
				'taskresult': function(err) {
					assert(err instanceof Error);
					assert(err.message === 'Task timeouted');
					assert(err.code === 'ETASKTIMEOUTED');
					assert(err.msDuration >= 1);
					done();
				}
			}
		}));
	});

	it ('should called done on timeout', function(done){
		unused(new Task({
			autostart: true,
			timeout: 10, // ms
			run: function (done, log) {
				return;
			},
			listeners: {
				'done': function() {
					done();
				}
			}
		}));
	});

	it ('should have an id', function(done){
		var t = new Task({
			id : 'foo',
			run: function (done, log) {
				return;
			}
		});
		assert(t.id === 'foo');
		done();
	});

	it ('should have an auto id', function(done){
		var t = new Task({
			run: function (done, log) {
				return;
			}
		});
		assert(typeof t.id  === 'number');
		done();
	});

	it ('should be disabled', function(done){
		var t = new Task({
			disabled: true,
			run: function (done, log) {
				assert(false);
				return;
			}
		});
		t.start();
		setTimeout(function(){
			done();
		}, 10);
	});

	it ('should have an empty description', function(done){
		var t = new Task({	
			run: function (done, log) {
				return;
			}
		});
		assert(t.description === '');
		done();
	});

	it ('should have the description', function(done){
		var t = new Task({	
			description: 'foo',
			run: function (done, log) {
				return;
			}
		});
		assert(t.description === 'foo');
		done();
	});

	it ('should take some time', function(done){
		unused(new Task({	
			autostart: true,
			run: function (taskDone, log) {
				setTimeout(function(){
					taskDone(10);
				}, 20);
			},
			listeners: {
				'taskresult': function(err, result) {
					assert(result.data === 10);
					assert(result.msDuration >= 10);
					assert(result.date instanceof Date);
					done();
				}
			}
		}));
	});

	it ('should call run with data', function(done){
		unused(new Task({	
			autostart: true,
			data: 'foo',
			run: function (data, taskDone, log) {
				assert(data === 'foo');
				taskDone(data+'bar');
			},
			listeners: {
				'taskresult': function(err, result) {
					assert(result.data === 'foobar');
					done();
				}
			}
		}));
	});
	
});

