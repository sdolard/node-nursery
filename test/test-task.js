/*
Copyright © 2011-2012 by Sebastien Dolard (sdolard@gmail.com)
*/
/*jslint node: true */

var
assert = require('assert'),
task = require('../lib/task');

describe('task', function(){
	// it ('should throw an Exception when creating an empty task', function(done){
	// 	try {
	// 		task.create();
	// 	} catch(err) {
	// 		assert(err instanceof Error);
	// 		assert.strictEqual(err.code, 'EINVALIDACTION');
	// 		assert.strictEqual(err.message, 'action is undefined');
	// 		done();
	// 	}
	// });

	// it ('should return an error on taskresult when creating a ping task with no config', function(done){
	// 	var task = task.create({
	// 		action: 'ping'
	// 	});
	// 	task.on('taskresult', function (err, config, response, task) {
	// 		/*jslint unparam: true */
	// 		assert(err instanceof Error);
	// 		assert.strictEqual(err.code, 'ENOHOST');
	// 		assert.strictEqual(err.message, 'No host defined');
	// 		done();
	// 	});
	// 	task.run();
	// });

	// it ('should return an error on taskresult when creating a ping task with no config.host', function(done){
	// 	var task = task.create({
	// 		action: 'ping',
	// 		config: {}
	// 	});
	// 	task.on('taskresult', function (err, config, response, task) {
	// 		/*jslint unparam: true */
	// 		assert(err instanceof Error);
	// 		assert.strictEqual(err.code, 'ENOHOST');
	// 		assert.strictEqual(err.message, 'No host defined');
	// 		done();
	// 	});
	// 	task.run();
	// });

	it ('should run hello world task', function(done){
		var helloTask = task.create({
			action: function(id, config, done, progressLog){
				progressLog("before hello world");
				console.log("hello world.");
				progressLog("after hello world");
				done();
			},
			config: {
				host: 'localhost'
			},
			on: {
				'taskresult': function (err, config, response, task) {
					/*jslint unparam: true */
					assert.strictEqual(response.exitCode, 0);
					assert.strictEqual(config.host, 'localhost');
					assert.strictEqual(config.timeout, 1);
					assert(!config.ipV6);
					assert(response.date instanceof Date);
					assert.equal(typeof response.data, 'string');
					done();
				}
			}
		});
		helloTask.run();
	});
});

