/*jslint node: true*/
/*
* Copyright © 2014 by Sébastien Dolard (sdolard@gmail.com)
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
util = require('util'),
events = require('events'),



/**
* @class
* @param {Function} config.run
* @param [{Boolean} config.verbose] default false
* @param [{String|Number} config.id] default auto
* @param [{Object} config.data] default function of action value
* @param [{Boolean} config.enabled] default true
* @param [{String} config.description] default ''
* @param [{Boolean} config.autostart] default false
* @param [{Number} config.timeout] default 0 > no timeout
* @param [{Object} config.listeners] success.run, failure.run, complete.run
* @event 
*/
Task = (function(){
	// global var
	var autoId = 0;

	function Task(config) { // ctor
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

		// run timeout duration. Default 0 > none
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


		if(this.verbose) {
			this._debug(util.inspect(config, true, 100));
		}

		if (this.autostart) {
			this.start();
		}
	}
	util.inherits(Task, events.EventEmitter);

	/**
	* @static
	*/
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

		if (err) {
			this._debug('%s failed: %s', this.run, err.message);
		} else {
			this._debug("%s succeed", this.run);
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

	return Task;
}());




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



