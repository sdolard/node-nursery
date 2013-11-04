/*jslint node: true*/
/*
Copyright © 2011-2012 by Sebastien Dolard (sdolard@gmail.com)
*/


/*
A 'task':
- can be contained in a 'task set'
- call an {function} run
- can contains a 'task set collection' as dependency. 'task set collection' will be runned on THIS TASK 'taskresult' (success, failure, complete)
- emit a 'taskstart' event for each tasks of this set or subset
- emit a 'tasklog' event for each tasks of this set or subset
- emit a 'taskresult' event for each tasks of this set or subset
- emit a 'done' event when THIS task is done AND tasks of his 'task set collection' are done
*/

var
//node
util = require('util'),
events = require('events'),

// contrib
//_ = require('underscore'),


// lib
task_set_collection = require('./task_set_collection'),

// global var
autoId = 0,

/**
* @class
* @param {Function} config.run
* @param [{Boolean} config.verbose] default false
* @param [{String|Number} config.id] default auto
* @param [{Object} config.data] default function of action value
* @param [{Boolean} config.enabled] defaullt true
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

	// vorbose
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

	/* states
	* neverstarted
	* starting
	* result
	* done
	* log
	*/
	this.state = 'neverstarted';

	// Event
	this._registerListeners(config.listeners);

	// sub tasks
	this._subTaskSetCollections = [];

	if(this.verbose) {
		this._debug(util.inspect(config, true, 100));
	}

};
util.inherits(Task, events.EventEmitter);


Task.sanitizeConfig = function(config){
	config = config || {};

	var err,
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

	// on
	cleanConfig.listeners = config.listeners;

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
		his._debug('Task not ebabled');
		return;
	}

	var startTime = Date.now();

	this.state  = 'starting';
	this.emit('taskstart', this);

	this.run(this._done.bind(this, startTime), this._log.bind(this, startTime), this);
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

	this.state = 'log';
	this.emit('tasklog', msg, this);
};

Task.prototype._done = function (startTime, result) {
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

	this._runSubTaskSetCollection('complete');
	if (err) {
		this._debug('%s failed: %s', this.run, err.message);
		this._runSubTaskSetCollection('failed');
	} else {
		this._debug("%s succeed", this.run);
		this._runSubTaskSetCollection('succeed');
	}
	if (this._subTaskSetCollections.length === 0) {
		this.state = 'done';
		this.emit('done', this);
	}
};


/**
* @param {String} type
*/
Task.prototype._getTaskSetCollectionToRun = function(type) {
	if (this._on && this._on[type] && this._on[type].run) {
		return this._on[type].run;
	}
	return [];
};



/**
* @param {String} type
*/
Task.prototype._runSubTaskSetCollection = function(type){
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
	netTaskSetCollection.on('taskstart', this._onTaskSetCollectionStart.bind(this));
	netTaskSetCollection.on('tasklog', this._onTaskSetCollectionLog.bind(this));
	netTaskSetCollection.on('taskresult', this._onTaskSetCollectionResult.bind(this));
	netTaskSetCollection.on('done', this._onTaskSetCollectionDone.bind(this));
	this._subTaskSetCollections.push(netTaskSetCollection);
	netTaskSetCollection.start();
};


/**
* @param {Object} config
* @param {Task} taskSet
*/
Task.prototype._onTaskSetCollectionStart = function (config, task) {
	this.emit('taskstart', config, task);
};

/**
* @param {Object} config
* @param {Task} taskSet
* @param {Object} msg
*/
Task.prototype._onTaskSetCollectionLog = function (config, task, msg) {
	this.emit('tasklog', config, task, msg);
};

/**
* @param {Error} err
* @param {Object} config
* @param {Object} response
* @param {Task} taskSet
*/
Task.prototype._onTaskSetCollectionResult = function (err, config, response, task) {
	this.emit('taskresult', err, config, response, task);
};

/**
* @param {TaskSetCollection} netTaskSetCollection
*/
Task.prototype._onTaskSetCollectionDone = function (netTaskSetCollection) {
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



