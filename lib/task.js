/*jslint node: true*/
/*
Copyright © 2011-2012 by Sebastien Dolard (sdolard@gmail.com)
*/


/*
A 'task':
- can be contained in a 'parallelized tasks container'
- call an {function} run ( to run an action  like a ping, a http check, tcp check, node netasq script...)
- can contains a 'serialized tasks container' as dependency. 'serialized tasks' will be runned on THIS TASK 'taskresult' (on "success", "failure", "complete" events)
- emit a 'taskstart' event for this task and each tasks of the 'serialized tasks container'
- emit a 'tasklog' event for this task and each tasks of the 'serialized tasks container'
- emit a 'taskresult' event for this task and each tasks of the 'serialized tasks container'
- emit a 'done' event when THIS task is done AND tasks of the 'serialized tasks container' are done
*/


var
//node
util = require('util'),
events = require('events'),

// lib
serialized_tasks = require('./serialized_tasks'),

// global var
autoId = 0,

/**
* @class
* @param {Function} config.run
* @param [{Boolean} config.verbose] default false
* @param [{String|Number} config.id] default auto
* @param [{Object} config.data] default function of action value
* @param [{Boolean} config.enabled] default true
* @param [{String} config.description] default ''
* @param [{Object} config.on] success.run, failure.run, complete.run
* config.on.success.run will be called when this task or a sub task succeed
* config.on.failure.run will be called when this task or a sub task failed
* config.on.complete.run will be called when this task and sub tasks will be complete
* @example
*/
Task = function(config) {
	events.EventEmitter.call(this);

	config = Task.sanitizeConfig(config);
	if (config instanceof Error) {
		this._eexception(config);
	}

	// verbose
	this.verbose = config.verbose;

	// id
	this.id = config.id;

	// run
	this.run = config.run;

	// action data
	this.data = config.data;

	// enabled
	this.enabled = config.enabled;

	// description
	this.description = config.description || '';

	// autostart
	this.autostart = config.autostart;

	// run timeout duration. Default 0  none)
	this.timeout = config.timeout;

	/* states
	* neverstarted
	* started
	* result
	* done
	*/
	this.state = 'neverstarted';

	// Event
	this._registerListeners(config.listeners);

	// sub tasks
	this._arrayOfSerializedTasks = [];

	if(this.verbose) {
		this._debug(util.inspect(config, true, 100));
	}

	if (this.autostart) {
		this.start();
	}
};
util.inherits(Task, events.EventEmitter);


Task.sanitizeConfig = function(config){
	config = config || {};

	var 
	err,
	cleanConfig = {};

	// verbose
	cleanConfig.verbose = config.verbose || false;

	// id
	if (config.id === undefined) {
		cleanConfig.id = autoId++;
	} else {
		cleanConfig.id = config.id;
	}

	// run
	cleanConfig.run = config.run;
	if(!cleanConfig.run) {
		err = new Error('run is undefined');
		err.code = 'EUNDEFINEDRUN';
		return err;
	}
	if(typeof cleanConfig.run  !== 'function') {
		err = new Error('run is not a function');
		err.code = 'EINVALIDRUN';
		return err;
	}

	// run configuration
	cleanConfig.data = config.data;

	// enabled
	cleanConfig.enabled = config.enabled;
	if (cleanConfig.enabled === undefined) {
		cleanConfig.enabled = true;
	}

	// description
	cleanConfig.description = config.description || '';

	// listeners
	cleanConfig.listeners = config.listeners;

	// autostart
	cleanConfig.autostart = config.autostart;
	if (cleanConfig.autostart === undefined) {
		cleanConfig.autostart = false;
	}

	// timeout
	cleanConfig.timeout = parseInt(config.timeout, 10);
	if (isNaN(cleanConfig.timeout)) {
		cleanConfig.timeout = 0;
	}	

	return cleanConfig;
};



/**
*/
/*Task.prototype.getConfig = function(){
	var config = {
		verbose: this.verbose,
		config: _.clone(this.config),
		id: this.id,
		run: this.run,
		enabled: this.enabled,
		description: this.description,
		state: this.state
	};
	// we do not return password
	delete config.config.pwd;
	// we do not return login
	delete config.config.login;

	return config;
};
*/

Task.prototype._registerListeners = function(listeners) {
	var listener;
	if (listeners === undefined ) {
		return;
	}
	for(listener in listeners) {
		if (listeners.hasOwnProperty(listener)) {
			this.on(listener, listeners[listener]);
		}
	}
};


/**
*/
Task.prototype.start = function(){
	if (this.state !== 'neverstarted') {
		this._debug('Task already started');
		return;
	}
	if (!this.enabled) {
		this._debug('Task not ebabled');
		return;
	}

	var startTime = Date.now();

	this.state  = 'started';
	this.emit('taskstart', this);
	this.__done = this._done.bind(this, startTime); // used by timeout
	this.__log  = this._log.bind(this, startTime);
	this._startTimeout();
	this.run(this.__done, this.__log, this);
};


/**
*/
Task.prototype._startTimeout = function(){
	if (this.timeout === 0) {
		this._debug('No run timeout');
		return;
	}
	setTimeout(this._onRunTimeout.bind(this), this.timeout);
};

Task.prototype._onRunTimeout = function(){
	var e = new Error('Task timeouted');
	e.code = 'ETASKTIMEOUTED';
	this.__done(e);
};

/***/
Task.prototype._log = function(startTime, msg) {
	msg = msg || {};
	if (typeof msg === 'string') {
		msg = {
			msg: msg
		};
	}
	if (!msg.msg) {
		msg.msg = '';
	}
	if (!msg.date) {
		msg.date = new Date();
	}
	msg.msDuration = Date.now() - startTime;

	this.emit('tasklog', msg, this);
};

Task.prototype._done = function (startTime, result) {
	if (this.state === 'result') { // task could have been timeouted
		return;
	}
	var err;
	if (result instanceof Error) {
		err = result;
		result = undefined;
	}
	if (!err) {
		result = result || {};
		if (typeof result === 'string') {
			result = {
				msg: result
			};
		}
		if (!result.date) {
			result.date = new Date();
		}

		result.msDuration = Date.now() - startTime;
	} else {
		err.msDuration = Date.now() - startTime;
	}

	this.state = 'result';
	this.emit('taskresult', err, result, this);

	this._runSerializedTasks('complete');
	if (err) {
		this._debug('%s failed: %s', this.run, err.message);
		this._runSerializedTasks('failed');
	} else {
		this._debug("%s succeed", this.run);
		this._runSerializedTasks('succeed');
	}
	if (this._arrayOfSerializedTasks.length === 0) {
		this.state = 'done';
		this.emit('done', this);
	}
};


/**
* @param {String} type
*/
Task.prototype._getSerializedTaskToRun = function(type) {
	if (this._on && this._on[type] && this._on[type].run) {
		return this._on[type].run;
	}
	return [];
};



/**
* @param {String} type
*/
Task.prototype._runSerializedTasks = function(type){
	var
	serializedTasksConfig,
	serializedTasks;

	// serializedTasksConfig
	serializedTasksConfig = this._getSerializedTaskToRun(type);
	if (serializedTasksConfig.length === 0) {
		return;
	}

	// serializedTasks
	serializedTasks = serialized_tasks.create(serializedTasksConfig, this.id + '.' + type);
	serializedTasks.on('taskstart', this._onSerializedTaskStart.bind(this));
	serializedTasks.on('tasklog', this._onSerializedTaskLog.bind(this));
	serializedTasks.on('taskresult', this._onSerializedTaskResult.bind(this));
	serializedTasks.on('done', this._onSerializedTaskDone.bind(this));
	this._arrayOfSerializedTasks.push(serializedTasks);
	serializedTasks.start();
};


/**
* @param {Object} config
* @param {Task} taskSet
*/
Task.prototype._onSerializedTaskStart = function (config, task) {
	this.emit('taskstart', config, task);
};

/**
* @param {Object} config
* @param {Task} taskSet
* @param {Object} msg
*/
Task.prototype._onSerializedTaskLog = function (config, task, msg) {
	this.emit('tasklog', config, task, msg);
};

/**
* @param {Error} err
* @param {Object} config
* @param {Object} response
* @param {Task} taskSet
*/
Task.prototype._onSerializedTaskResult = function (err, config, response, task) {
	this.emit('taskresult', err, config, response, task);
};

/**
* @param {TaskSetCollection} serializedTasks
*/
Task.prototype._onSerializedTaskDone = function (serializedTasks) {
	var i;
	for(i = 0; i < this._arrayOfSerializedTasks.length; i++) {
		if (this._arrayOfSerializedTasks[i] === serializedTasks){
			this._arrayOfSerializedTasks.splice(i, 1);
			break;
		}
	}
	if (this._arrayOfSerializedTasks.length !== 0) {
		return;
	}
	this.state = 'done';
	this.emit('done', this);
};


/**
* Task only if verbose is positive
* @public
* @method
*/
Task.prototype._debug = function() {
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
Task.prototype._eexception = function(exception) {
    var error;
    if (exception instanceof Error) {
        error = exception;
    } else {
        error = new Error(exception.message);
        Error.captureStackTrace(error, Task.prototype._eexception); // we do not trace this function
        error.code = exception.code;
    }

    this.emit('error', error);

    if(this.verbose) {
    	this._debug(error.stack);
   	}
};

/**
* @param {object} config
*/
exports.create = function(config) {
	return new Task(config);
};

/**
* @param {object} config
*/
exports.sanitizeConfig = function( config) {
	return Task.sanitizeConfig(config);
};



