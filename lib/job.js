
/*jslint node: true, unparam: false */

/*
Job engine description
- job
/- task set collection
/- task set
/- task
/- task
/- ...
/- task set
/- ...
- job
- ...


A 'job'
- run a 'serialized tasks container' when time arrive (cf cronTime rules)
- contains only one 'serialized tasks container'
- emit a 'taskstart' event for each contained tasks
- emit a 'taskresult' event for each contained tasks
- emit a 'done' event when 'task set collection' is done


	A 'serialized tasks container':
	- is contained in a 'job'
	- is an array 'parallelized tasks container'.
	- run 'parallelized tasks container' with a serial access. Previous 'parallelized tasks container' must be done to run next one, and so on
	- emit a 'taskstart' event for each contained tasks
	- emit a 'taskresult' event for each contained tasks
	- emit a 'done' event when all 'task sets' are done


		A 'parallelized tasks container':
		- is contained in a 'serialized tasks container'
		- is a array of tasks. It can contains only one
		- run tasks in parallel (async node style)
		- can contains a 'serialized tasks container' as dependency. 'serialized tasks container' will be runned on THOSE TASKS 'taskresult' (success, failure, complete)
		- emit a 'taskstart' event for each contained tasks
		- emit a 'taskresult' event for each contained tasks
		- emit a 'done' event when all 'tasks' are done
	
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
// node
util = require('util'),
events = require('events'),

// contrib
cron = require('cron'),

// lib
task_set_collection = require('./task_set_collection'),

Job = (function() {
	var
	// global var
	autoId = 0,
	CRON_EACH_SECOND = '* * * * * *';


	/**
	* @param [{String|DateTime} config.cronTime] default '* * * * * *' > each second
	* @param [{Boolean} config.runOnce] default false, to run a job only one time
	* @param [{Boolean} config.verbose] default false
	* @param [{String|Number} config.id] default auto
	* @param [{Boolean} config.enabled] defaullt true
	* @param [{String} config.description] default ''
	*/
	function Job(config) {
		events.EventEmitter.call(this);

		config = Job.sanitizeConfig(config);

		// verbose
		this.verbose = config.verbose;

		// id
		this.id = config.id;

		// cron
		this.cronTime = config.cronTime;

		// run once
		this.runOnce = config.runOnce;

		// enabled, used too to abord
		this.enabled = config.enabled;

		// description
		this.description = config.description;

		// done count
		this._doneCount = 0;

		// set to true when job is aborted
		// see
		this._aborted = false;

		// _taskSetCollection
		this._taskSetCollection = task_set_collection.create(config.task, this.id);
		this._taskSetCollection.on('taskstart', this._onTaskStart.bind(this));
		this._taskSetCollection.on('taskprogress', this._onTaskProgress.bind(this));
		this._taskSetCollection.on('taskresult', this._onTaskResult.bind(this));
		this._taskSetCollection.on('done', this._onTaskSetCollectionDone.bind(this));

		// CronJob
		this._cronJob = new cron.CronJob(this.cronTime, this._onCronJobTick.bind(this));

		// CronJob start
		if (this.enabled) {
			this._wasEnabled = true;
			this._cronJob.start();
		} else {
			this._wasEnabled = false;
		}
	}
	util.inherits(Job, events.EventEmitter);

	/**
	* @static
	*/
	Job.sanitizeConfig = function(config, keepTasks) {
		config = config || {};
		keepTasks = keepTasks === undefined ? true : keepTasks;


		var cleanConfig = {};

		// verbose
		cleanConfig.verbose = config.verbose || false;

		// id
		if (config.id === undefined) {
			cleanConfig.id = autoId++;
		} else {
			cleanConfig.id = config.id;
		}

		// cron
		cleanConfig.cronTime = config.cronTime || CRON_EACH_SECOND;

		// runOnce
		cleanConfig.runOnce = config.runOnce;

		// enabled
		if (cleanConfig.enabled === undefined) {
			cleanConfig.enabled = true;
		}
		cleanConfig.enabled = config.enabled;

		// description
		cleanConfig.description = config.description || '';

		// task
		if (keepTasks) {
			cleanConfig.task = config.task || [];
		}
		return cleanConfig;
	};


	Job.prototype.getData = function(){
		return {
			verbose: this.verbose,
			id: this.id,
			cronTime: this.cronTime,
			runOnce: this.runOnce,
			doneCount: this._doneCount,
			enabled: this.enabled,
			description: this.description
		};
	};


	Job.prototype._onCronJobTick = function () {
		this._cronJob.stop();
		this._taskSetCollection.run();
	};


	Job.prototype.abort = function () {
		this.enabled = false;
		if (this._cronJob.running) {
			this._cronJob.stop();

			this._abort();
		}
	};

	Job.prototype._abort = function () {
		this._aborted = true;
		this.emit('abort', this);
	};

	/**
	* @param {Object} config
	* @param {Object} task
	*/
	Job.prototype._onTaskStart = function (config, task) {
		this.emit('taskstart', config, task, this);
	};

	/**
	* @param {Object} config
	* @param {Object} task
	*/
	Job.prototype._onTaskProgress = function (config, task, msg) {
		this.emit('taskprogress', config, task, msg, this);
	};

	/**
	* @param {Error} err
	* @param {Object} config
	* @param {Object} response
	* @param {NetTask} task
	*/
	Job.prototype._onTaskResult = function (err, config, response, task) {
		this.emit('taskresult', err, config, response, task, this);
	};


	/**
	* @param {NetTaskSetCollection} netTaskSetCollection
	*/
	Job.prototype._onTaskSetCollectionDone = function (/*taskSetCollection*/) {
		this._doneCount++;
		this.emit('done', this);
		if (!this.runOnce) {
			// job is stopped when tick event came
			if (this.enabled) {
				this._cronJob.start();
			} else {
				this._abort();
			}
		}
	};

	/**
	* @returns {Number} of job done
	*/
	Job.prototype.getDoneCount = function () {
		return this._doneCount;
	};

	/**
	* @returns {Boolean} true if job is terminated
	* Terminated meens that job as been run at least once and is
	* no more running
	*/
	Job.prototype.isTerminated = function () {
		if (!this._wasEnabled) {
			return true;
		}

		if (this._aborted) {
			return true;
		}

		if (!this.runOnce) {
			return false;
		}

		return this._doneCount > 0;
	};


	/**
	* NetTask only if verbose is positive
	* @public
	* @method
	*/
	Job.prototype._log = function() {
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
	Job.prototype._eexception = function(exception) {
		var error;
		if (exception instanceof Error) {
			error = exception;
		} else {
			error = new Error(exception.message);
			Error.captureStackTrace(error, Job.prototype._eexception); // we do not trace this function
			error.code = exception.code;
		}

		this.emit('error', error);
		this._log(error.stack);
	};

	return Job;

}());

exports.create = function(config) {
	return new Job(config);
};

exports.sanitizeConfig = function(config, keepTasks) {
	return Job.sanitizeConfig(config, keepTasks);
};

