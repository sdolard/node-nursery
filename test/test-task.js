/*
Copyright ©2014 by Sebastien Dolard (sdolard@gmail.com)
*/
/*jslint node: true, unparam: true */

var
assert = require('assert'),
domain = require('domain'),
task = require('../lib/task');

describe('task', function(){
	it ('should have a run config', function(done){
		var d = domain.create();
		d.on('error', function(e) {
		 	if (e.code === 'EUNDEFINEDRUN') {
				done();
			}
		});
		d.run(function(){
			task.create();
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
			task.create({
				run: 5
			});
		});

	});

	it ('should call taskstart event', function(done){
		var aTask = task.create({
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
		task.create({
			autostart: true,
			run: function (done) {
				done();
			},
			listeners: {
				'taskstart': function() {
					done();
				}
			}
		});
	});

	it ('should not autostart', function(done){
		var aTask = task.create({
			autostart: false,
			run: function () {
				return;
			}
		});
		assert(aTask.state === 'neverstarted');
		done();
	});

	it ('should log', function(done){
		task.create({
			autostart: true,
			run: function (done, log) {
				log('a task log');
			},
			listeners: {
				'tasklog': function(log) {
					assert(log.msg === 'a task log');
					assert(log.msDuration >= 0);
					assert(log.date !== undefined);
					assert(log.date !== null);
					done();
				}
			}
		});
	});

	it ('should return a result', function(done){
		task.create({
			autostart: true,
			run: function (done) {
				done(5);
			},
			listeners: {
				'taskresult': function(err, result) {
					assert(err === undefined);
					assert(result === 5);
					done();
				}
			}
		});
	});

	it ('should return a Error', function(done){
		task.create({
			autostart: true,
			run: function (done) {
				done(new Error('This is an error'));
			},
			listeners: {
				'taskresult': function(err, result) {
					assert(err !== undefined);
					assert(err.message === 'This is an error');
					assert(result === undefined);
					done();
				}
			}
		});
	});

	it ('should call done event', function(done){
		task.create({
			autostart: true,
			run: function (done) {
				done();
			},
			listeners: {
				'done': function() {
					done();
				}
			}
		});
	});

	it ('should call start, then log, result and done', function(done){
		var steps = {
			start: 0,
			log: 1,
			result : 2,
			done: 3
		},
		step = 0;
		task.create({
			autostart: true,
			run: function (done, log) {
				log('foo');
				done(10);
			},
			listeners: {
				'taskstart': function() {
					assert(steps.start === step);
					step++;
				},
				'tasklog': function(log) {
					assert(log.msg === 'foo');
					assert(steps.log === step);
					step++;
				},
				'taskresult': function(err, result) {
					assert(result === 10);
					assert(steps.result === step);
					step++;
				},
				'done': function() {
					assert(steps.done === step);
					done();
				}
			}
		});
	});

	it ('should timeout', function(done){
		task.create({
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
		});
	});

	it ('should timeout before run timeout', function(done){
		task.create({
			autostart: true,
			timeout: 1, // ms
			run: function (taskDone) {
				setTimeout(function() {
					taskDone();
				}, 200);
			},
			listeners: {
				'taskresult': function(err) {
					assert(err !== undefined);
					assert(err.message === 'Task timeouted');
					assert(err.code === 'ETASKTIMEOUTED');
					assert(err.msDuration >= 1);
					done();
				}
			}
		});
	});

	it ('should called done on timeout', function(done){
		task.create({
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
		});
	});
});

