/*jslint node: true*/
/*
Copyright © 2011-2012 by Sebastien Dolard (sdolard@gmail.com)
*/


/*
A 'serialized tasks container':
- is contained in a 'job'
- is an array 'parallelized tasks container'.
- run 'parallelized tasks container' with a serial access. Previous 'parallelized tasks container' must be done to run next one, and so on
- emit a 'taskstart' event for each contained tasks
- emit a 'taskresult' event for each contained tasks
- emit a 'done' event when all 'parallelized tasks container' are done

*/

var
// node
util = require('util'),
events = require('events'),

// lib
parallelized_tasks = require('./parallelized_tasks'),

// global var
autoId = 0,

/**
* @class
* @param [{Array} tasks]
* @param [{String} parentId]
*/
SerializedTasks = function(tasks, parentId) {
	events.EventEmitter.call(this);

	tasks = SerializedTasks.sanitizeConfig(tasks);

	if(tasks instanceof Error) {
		return this._eexception(tasks);
	}

	// tasks
	this.tasks = tasks;

	// id
	if (parentId === undefined) {
		this.id = autoId++;
	} else {
		this.id = parentId + '.c';
	}
};
util.inherits(SerializedTasks, events.EventEmitter);


SerializedTasks.prototype.run = function(){
	var
	i,
	parallelizedTaskConfig,
	parallelizedTasks,
	parallelizedTasksCount = 0;

	// array of parallelized tasks
	this._arrayOfParallelizedTasks = [];
	for (i = 0; i < this.tasks.length; i++) {
		parallelizedTaskConfig = parallelized_tasks.sanitizeConfig(this.tasks[i]);
		if (parallelizedTaskConfig instanceof Error) {
			return this._eexception(parallelizedTaskConfig);
		}

		parallelizedTaskConfig.id = this.id + '.s' + parseInt(parallelizedTasksCount++, 10);
		if (!parallelizedTaskConfig.enabled) { // must be done after setting ID, parallelizedTasksCount is always inc even if state is off
			continue;
		}

		parallelizedTasks = parallelized_tasks.create(parallelizedTaskConfig);
		parallelizedTasks.on('taskstart', this._onParallelizedTaskStart.bind(this));
		parallelizedTasks.on('taskprogress', this._onParallelizedTaskProgress.bind(this));
		parallelizedTasks.on('taskresult', this._onParallelizedTaskResult.bind(this));
		// Should be once to manage sync exception
		// Those will break collection managment
		parallelizedTasks.once('done', this._onParallelizedTaskDone.bind(this));
		this._arrayOfParallelizedTasks.push(parallelizedTasks);
	}

	if (this._arrayOfParallelizedTasks.length === 0) {
		this.emit('done', this);
	} else {
		// We run first one
		this._arrayOfParallelizedTasks[0].run();
	}
};


SerializedTasks.sanitizeConfig = function(config) {
	var
	err,
	cleanConfig;

	if (!config instanceof Array) {
		err = new Error('tasks must be an array');
		err.code = 'EINVALIDTASKS';
		return err;
	}

	if (config.length === 0) {
		return config;
	}

	if (!config[0].set) {
		cleanConfig = [];
		cleanConfig.push({
			set: config
		});
	} else {
		cleanConfig = config;
	}
	return cleanConfig;
};

/**
* @param {Object} config
* @param {NetTask} task
*/
SerializedTasks.prototype._onParallelizedTaskStart = function (config, task) {
	this.emit('taskstart', config, task);
};

/**
* @param {Object} config
* @param {NetTask} task
* @param {Object} msg
*/
SerializedTasks.prototype._onParallelizedTaskProgress = function (config, task, msg) {
	this.emit('taskprogress', config, task, msg);
};

/**
* @param {Error} err
* @param {Object} config
* @param {Object} response
* @param {NetTask} task
*/
SerializedTasks.prototype._onParallelizedTaskResult = function (err, config, response, task) {
	this.emit('taskresult', err, config, response, task);
};


/**
* @param {NetTaskSet} parallelizedTasks
*/
SerializedTasks.prototype._onParallelizedTaskDone = function (parallelizedTasks) {
	// We remove first parallelizedTasks
	var previousParallelizedTasks = this._arrayOfParallelizedTasks.shift();
	if (previousParallelizedTasks !== parallelizedTasks){
		//console.log('previousParallelizedTasks', previousParallelizedTasks);
		//console.log('parallelizedTasks', parallelizedTasks);
		return this._eexception({
				message: 'Removing invalid parallelizedTasks (a task MUST call only once the cb!)',
				code: 'EINVALIDPARALLELIZEDTASKS'
		});
	}

	if (this._arrayOfParallelizedTasks.length === 0) {
		this.emit('done', this);
	} else {
		// Running next one
		this._arrayOfParallelizedTasks[0].run();
	}
};

/**
* SerializedTasks only if verbose is positive
* @public
* @method
*/
SerializedTasks.prototype._log = function() {
	if (!this.verbose) {
		return;
	}
	var args = arguments,
	v = parseInt((new Date()).getTime(), 10) + ' verbose # ';
	args[0] = args[0].replace('\n', '\n' + v);
	args[0] = v.concat(args[0]);
	console.error.apply(console, args);
};


/**
* @private
*/
SerializedTasks.prototype._eexception = function(exception) {
	var error;
	if (exception instanceof Error) {
		error = exception;
	} else {
		error = new Error(exception.message);
		Error.captureStackTrace(error, SerializedTasks.prototype._eexception); // we do not trace this function
		error.code = exception.code;
	}

	this.emit('error', error);
	this._log(error.stack);
};

/******************************************************************************/
// exports
exports.create = function(config, parentId) {
	return new SerializedTasks(config, parentId);
};

