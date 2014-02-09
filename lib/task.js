/*jslint node: true*/
/*
* Copyright ©2014 by Sébastien Dolard (sdolard@gmail.com)
*/
 
var
util = require('util'),
events = require('events'),
/** 
* Auto id related to task [optionnal] id
* @see Task
*/
autoId = 0,

/**
* A 'task'
* <ul>
* <li>can be contained in a 'parallelized tasks container'</li>
* <li>call an {function} run ( to run an action  like a ping, a http check, tcp check, node netasq script...)</li>
* <li>can contains a 'serialized tasks container' as dependency. 'serialized tasks' will be runned on THIS TASK 'taskresult' (on "success", "failure", "complete" events)</li>
* <li>emit a 'taskstart' event for this task and each tasks of the 'serialized tasks container'</li>
* <li>emit a 'tasklog' event for this task and each tasks of the 'serialized tasks container'</li>
* <li>emit a 'taskresult' event for this task and each tasks of the 'serialized tasks container'</li>
* <li>emit a 'done' event when THIS task is done AND tasks of the 'serialized tasks container' are done</li>
* </ul>
* @constructor
* @param {Function} config.run - Function called on start.
* @param {Boolean} [config.verbose=false]
* @param {String|Number} [config.id] - if undefined then auto defined
* @param {Object} [config.data] - data pass as first argument to run function
* @param {Boolean} [config.disabled=false]
* @param {String} [config.description='']
* @param {Boolean} [config.autostart=false]
* @param {Number} [config.timeout=0] - 0 means no timeout
* @param {Object} [config.listeners] - todo
* @fires Task#taskstart
* @fires Task#tasklog
*/
Task = module.exports = function (config) {
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

    // disabled
    this.disabled = config.disabled;

    // description
    this.description = config.description || '';

    // autostart
    this.autostart = config.autostart;

    // run timeout duration. Default 0 > none
    this.timeout = config.timeout;

    /**
     * States: neverstarted, started, result, done
     * @readonly
     * @enum {string}
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
};
util.inherits(Task, events.EventEmitter);

/**
* Start the Task.run function when autostart equal false
*/
Task.prototype.start = function(){
    if (this.state !== 'neverstarted') {
        this._debug('Task already started');
        return;
    }
    if (this.disabled) {
        this._debug('Task disabled');
        return;
    }

    var startTime = Date.now();

    this.state = 'started';
    /**
    * Task event.
    *
    * @event Task#taskstart
    * @params {Object} this - Task
    */
    this.emit('taskstart', this);
    this.__done = this._done.bind(this, startTime); // used by timeout
    this.__log  = this._log.bind(this, startTime);
    this._startTimeout();
    if (this.data) {
        this.run(this.data, this.__done, this.__log, this);
    } else {
        this.run(this.__done, this.__log, this);
    }
};

/**
* Valid a configuration
* @returns {Object} config
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
    cleanConfig.id = config.id === undefined ? autoId++ : config.id;

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

    // disabled
    cleanConfig.disabled = config.disabled === undefined ? false : config.disabled;
    
    // description
    cleanConfig.description = config.description || '';

    // listeners
    cleanConfig.listeners = config.listeners;

    // autostart
    cleanConfig.autostart = config.autostart === undefined ? false : config.autostart;

    // timeout
    cleanConfig.timeout = parseInt(config.timeout, 10);
    if (isNaN(cleanConfig.timeout)) {
        cleanConfig.timeout = 0;
    }   

    return cleanConfig;
};


/**
* @private
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
* @private
*/
Task.prototype._startTimeout = function(){
    if (this.timeout === 0) {
        this._debug('No run timeout');
        return;
    }
    setTimeout(this._onRunTimeout.bind(this), this.timeout);
};

/**
* @private
*/
Task.prototype._onRunTimeout = function(){
    var e = new Error('Task timeouted');
    e.code = 'ETASKTIMEOUTED';
    this.__done(e);
};

/**
* @private
*/
Task.prototype._log = function(startTime, msg) {
    /**
    * Task event.
    *
    * @event Task#tasklog
    * @type {object}
    * @property {*} msg - todo
    * @property {Date} date - todo
    * @property {Number} msDuration - todo
    */
    this.emit('tasklog', {
         msg: msg || '',
         date: new Date(),
         msDuration:  Date.now() - startTime
    }, this);
};



/**
* @private
*/
Task.prototype._done = function (startTime, result) {
    if (this.state === 'result') { // task could have been timeouted
        return;
    }
    var err, r;
    if (result instanceof Error) {
        err = result;
    }
    if (!err) {
        r = {
            date: new Date(),
            msDuration: Date.now() - startTime
        };
        if (result !== undefined) {
            r.data = result;
        }
    } else {
        err.msDuration = Date.now() - startTime;
    }

    this.state = 'result';
    this.emit('taskresult', err, r, this);

    if (err) {
        this._debug('%s failed: %s', this.run, err.message);
    } else {
        this._debug("%s succeed", this.run);
    }
    this.state = 'done';
    this.emit('done', this);
};


/**
* Only if verbose equal true
* @private
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
