/*
Copyright © 2011-2012 by Sebastien Dolard (sdolard@gmail.com)
*/


/*
A 'parallelized tasks':
  - is contain in 'serialized tasks'
  - is a set of tasks. It can contains only one
  - run tasks in parallel (async node style)
  - can contains a 'serialized tasks' as dependency. 'serialized tasks' will be runned on THOSE TASKS 'taskresult' (success, failure, complete)
  - emit a 'taskstart' event for each contained tasks
  - emit a 'taskresult' event for each contained tasks
  - emit a 'done' event when all 'tasks' are done

*/

var
//node
util = require('util'),
events = require('events'),

// lib
task = require('./task'),
task_set_collection = require('./task_set_collection'),

// global var
autoId = 0,

/**
* @class
* @param [{Array|Object} config]
*/
TaskSet = function(config) {
	events.EventEmitter.call(this);

	config = TaskSet.sanitizeConfig(config);

	// set
	this.set = config.set;

	// id
	this.id = config.id;

	// verbose
	this.verbose = config.verbose;

	// enabled
	this.enabled = config.enabled;

	// description
	this.description = config.description;

	// Event
	this._on = config.on;

	// tasks
	this._tasks = [];

	// sub tasks
	this._subTaskSetCollections = [];
};
util.inherits(TaskSet, events.EventEmitter);


/**
* @static
*/
TaskSet.sanitizeConfig = function(config) {
	config = config || [];
	var cleanConfig = {};

	// array of tasks or 'set' property?
	if (config.set) {
		cleanConfig.set = config.set || [];
		// Event
		cleanConfig.on = config.on;
	} else {
		cleanConfig.set = [];
		cleanConfig.set.push(config);
	}

	// id
	if (config.id === undefined) {
		cleanConfig.id = autoId++;
	} else {
		cleanConfig.id = config.id;
	}

	// verbose
	cleanConfig.verbose = config.verbose || false;

	// enabled
	if (cleanConfig.enabled === undefined) {
		cleanConfig.enabled = true;
	}

	// description
	cleanConfig.description = config.description || '';

	return cleanConfig;
};


TaskSet.prototype.run = function(){
	var
	i,
	taskConfig,
	task,
	taskCount = 0;

	this._resultCount = {
		failure: 0,
		success: 0
	};
	for(i = 0; i < this.set.length; i++) {
		taskConfig = task.sanitizeConfig(this.set[i]);
		if (taskConfig instanceof Error) {
			return this._eexception(taskConfig);
		}
		taskConfig.id = this.id + '.t' + parseInt(taskCount++, 10);
		if (!taskConfig.enabled) { // must be done after setting ID, taskCount is always inc even if state is off
			continue;
		}
		task = task.create(taskConfig);
		task.on('taskstart', this._onTaskStart.bind(this));
		task.on('taskprogress', this._onTaskProgress.bind(this));
		task.on('taskresult', this._onTaskResult.bind(this));
		task.on('done', this._onTaskDone.bind(this));
		this._tasks.push(task);
		task.run();
	}

	// If there is no task, we send done event
	if (this._tasks.length === 0) {
		this.emit('done', this);
	}
};


/**
* @param {Object} config
* @param {NetTask} task
*/
TaskSet.prototype._onTaskStart = function (config, task) {
	this.emit('taskstart', config, task);
};

/**
* @param {Object} config
* @param {NetTask} task
* @param {Object} msg
*/
TaskSet.prototype._onTaskProgress = function (config, task, msg) {
	this.emit('taskprogress', config, task, msg);
};

/**
* @param {Error} err
* @param {Object} data
* @param {NetTask} taskSet
*/
TaskSet.prototype._onTaskResult = function (err, config, response, task) {
	if (err) {
		this._resultCount.failure++;
	} else {
		this._resultCount.success++;
	}
	this.emit('taskresult', err, config, response, task);
};


/**
* @param {NetTask} task
*/
TaskSet.prototype._onTaskDone = function (task) {
	var i;
	for(i = 0; i < this._tasks.length; i++) {
		if (this._tasks[i] === task){
			this._tasks.splice(i, 1);
			break;
		}
	}
	if (this._tasks.length !== 0) {
		return;
	}

	this._runSubTaskSetCollections();
};

/**
* @param {String} type
*/
TaskSet.prototype._getTaskSetCollectionToRun = function(type) {
	if (this._on && this._on[type] && this._on[type].run) {
		return this._on[type].run;
	}
	return [];
};


TaskSet.prototype._runSubTaskSetCollections = function(){
	// Complete event
	this._runSubTaskSetCollection('complete');

	if (this._resultCount.failure === 0 && this._resultCount.success > 0) {
		this._runSubTaskSetCollection('success');
	}

	if (this._resultCount.success === 0 && this._resultCount.failure > 0) {
		this._runSubTaskSetCollection('failure');
	}

	if (this._subTaskSetCollections.length === 0) {
		this.emit('done', this);
	}
};

/**
* @param {String} type
*/
TaskSet.prototype._runSubTaskSetCollection = function(type){
	var
	netTaskSetCollectionConfig,
	netTaskSetCollection;

	// netTaskSetCollectionConfig
	netTaskSetCollectionConfig = this._getTaskSetCollectionToRun(type);
	if (netTaskSetCollectionConfig.length === 0) {
		return;
	}

	// netTaskSetCollection
	netTaskSetCollection = task_set_collection.create(netTaskSetCollectionConfig, this.id + '.' + type);
	netTaskSetCollection.on('taskstart', this._onTaskStart.bind(this));
	netTaskSetCollection.on('taskprogress', this._onTaskProgress.bind(this));
	netTaskSetCollection.on('taskresult', this._onTaskResult.bind(this));
	netTaskSetCollection.on('done', this._onTaskSetCollectionDone.bind(this));
	this._subTaskSetCollections.push(netTaskSetCollection);
	netTaskSetCollection.run();
};


/**
* @param {TaskSetCollection} netTaskSetCollection
*/
TaskSet.prototype._onTaskSetCollectionDone = function (netTaskSetCollection) {
	var i;
	for(i = 0; i < this._subTaskSetCollections.length; i++) {
		if (this._subTaskSetCollections[i] === netTaskSetCollection){
			this._subTaskSetCollections.splice(i, 1);
			break;
		}
	}
	if (this._subTaskSetCollections.length !== 0) {
		return;
	}

	this.emit('done', this);
};



/**
* TaskSet only if verbose is positive
* @public
* @method
*/
TaskSet.prototype._log = function() {
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
TaskSet.prototype._eexception = function(exception) {
    var error;
    if (exception instanceof Error) {
        error = exception;
    } else {
        error = new Error(exception.message);
        Error.captureStackTrace(error, TaskSet.prototype._eexception); // we do not trace this function
        error.code = exception.code;
    }

    this.emit('error', error);
    this._log(error.stack);
};

/**
* @param {object} config
*/
exports.create = function(config) {
	return new TaskSet( config);
};

/**
* @param {object} config
*/
exports.sanitizeConfig = function( config) {
	return TaskSet.sanitizeConfig(config);
};
