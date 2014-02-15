var util = require('util');
var stream = require('stream');
var commands = require('./commands');
var rest = require('restler');

util.inherits(Driver,stream);
util.inherits(Device,stream);

function Driver(opts,app) {
  this._app = app;
  this.opts = opts;
  opts.zipCode = opts.zipCode || "10007";
  opts.useFahrenheit = opts.useFahrenheit || false;
  if (opts.useFahrenheit === "true")
    opts.useFahrenheit = true;
  if (opts.useFahrenheit === "false")
    opts.useFahrenheit = false;
  opts.forecastHours = opts.forecastHours == null ? 1 : opts.forecastHours;
  opts.pauseAfterSetToUpdate = opts.pauseAfterSetToUpdate || 5000; // in milliseconds
  opts.updateInterval = opts.updateInterval || 300000; // in milliseconds
  this.save();
  this.devices = {};
  this.timerId = null;
  app.once('client::up',function(){
    if (opts.apiKey)
      this.createDevices();
  }.bind(this));
};

Driver.prototype.createDevices = function() {
  var self = this;
  this._app.log.debug('weatherDriver Creating Devices');
  commands(this.opts).forEach( this.createCommandDevice.bind(this) );
  self.updateDevices(this._app, this.opts);

  // ensure there's only one timer running
  if (self.timerId) {
    clearInterval(self.timerId);
    self.timerId = null;
  }

  process.nextTick(function() { // Once all devices are set up, establish a single update process that updates every "updateInterval" seconds
    self.timerId = setInterval(function() {
      self.updateDevices(self._app, self.opts);
    }, self.opts.updateInterval);
  });
};

Driver.prototype.createCommandDevice = function(cmd) {
  // prevent creation of duplicated devices
  if (!this.devices[cmd.name]) {
    var d = new Device(this._app, cmd);
    this.devices[cmd.name] = d;
    this.emit('register', d);
  }
};

function Device(app, config) {
  app.log.info('Creating weatherDriver Device : ' + config.name);
  var self = this;
  this._app = app;
  this.config = config;
  this.readable = true;
  this.writeable = config.canSet || false;
  if (this.writeable) { app.log.debug('weatherDriver Device ' + config.name + ' is readable and writable' ); } else app.log.debug('weatherDriver Device ' + config.name + ' is readable only' );
  this.V = config.vendorId || 0;
  this.D = config.deviceId;
  this.G = 'wd' + (config.name).replace(/[^a-zA-Z0-9]/g, '');
  this.name = 'weatherDriver - ' + config.name;
  // this.read();
};

Driver.prototype.updateDevices = function() { // runs every "updateInterval" seconds
  var self = this;
  var app = this._app;
  var opts = this.opts;

  app.log.debug("Updating weatherDriver Devices...");

  // a single api request can combine many forms of data so as to save you # of requests per day, etc.
  // can be: alerts, almanac, astronomy, conditions, currenthurricane, forecast, forecast10day, geolookup, history, hourly, hourly10day, planner, rawtide, satellite, tide, webcams, yesterday
  var weathDataFeatures = ["conditions", "hourly"]

  // example: http://api.wunderground.com/api/6ed6c7fe07d64fa7/conditions/q/30736.json - See api for documentation - http://api.wunderground.com/api/apiKey/features (can be combined more than one)/settings (leave out to accept defaults)/q/query (the location - can be a zip code, city, etc).format (json or xml)
  var url = "http://api.wunderground.com/api/" + opts.apiKey + "/" + weathDataFeatures.join("/") + "/q/" + opts.zipCode + ".json";

  rest.get(url).on('complete', function(result) {
    // app.log.debug("Result of weatherDriver command: %j", result);
    if (result instanceof Error) {
      app.log.warn('weatherDriver : ' + this.name + ' error! - ' + result.message);
      this.retry(60000); // try again after 60 sec
    }
    else {
      var keys = Object.keys(self.devices);
      keys.forEach(function(key){
        var dev = self.devices[key];
        app.log.debug('Updating weatherDriver Device: ' + dev.name);
        var parsedResult = undefined;
        (dev.config.data || []).forEach(function(fn) {
          try {
            parsedResult = fn(result, opts.useFahrenheit);
          } catch(e) {
            parsedResult = undefined;
          }
        });
        if (parsedResult !== undefined) {
          app.log.debug("%s: %s", dev.name, parsedResult);
          dev.emit('data', parsedResult);
        }
        else {
          app.log.warn("%s did not emit data!", dev.name);
        };
      });

    };
  });
};

Device.prototype.write = function(dataRcvd) {
  var app = this._app;
  var opts = this.opts;
  app.log.debug("weatherDriver Device " + this.name + " received data: " + dataRcvd);
  app.log.debug("weatherDriver Device canSet: " + this.config.canSet);
  if (this.config.canSet) {
    var stgSubmit = undefined;
    (this.config.setStg || []).forEach(function(fn) {
      try {
        stgSubmit = fn(opts.apiKey, dataRcvd);
      } catch(e) {
        stgSubmit = undefined;
      }
    });
    app.log.debug("weatherDriver string: " + stgSubmit);
    if (stgSubmit !== undefined) {
      app.log.debug(this.name + " - submitting data to thermostat: " + stgSubmit);
      var rslt = exec(stgSubmit, function (error, stdout, stderr) {
        stdout.replace(/(\n|\r|\r\n)$/, '');
        app.log.debug(this.name + " - Result: " + stdout);
        setTimeout( function() { updateDevices(app, opts) }, opts.pauseAfterSetToUpdate);
      });
    }
    else {
      app.log.debug(this.name + ' - error parsing data!');
    };    
  }
  else {
    app.log.debug("weatherDriver Device " + this.name + " received data, but this type of device can't update");
  }
};

var validateNumber = function(cb, number, message) {
  var data = number;
  if (typeof data == 'string') {
    try {
      data = parseFloat(data);
    } catch(e) {}
  }
  if (typeof data != 'number' || isNaN(data) || data <= 0) {
    cb(null, {
      "contents": [
        { "type": "paragraph", "text": message + " must be a number > 0. Please try again." },
        { "type": "close"    , "name": "Close" }
      ]
    });
    return null;
  }
  return data;
}

Driver.prototype.config = function(rpc,cb) {
  var self = this;
  if (!rpc) {
    this._app.log.debug("weatherDriver main config window called");
    return cb(null, { // main config window
      "contents":[
        { "type": "paragraph", "text": "The weatherDriver allows you to monitor the weather outside. To use this, you'll need a free api from http://www.wunderground.com/weather/api/ - Enter the settings below to get started, and please make sure you get a confirmation message after hitting 'Submit' below. (You may have to click it a couple of times. If you don't get a confirmation message, the settings did not update!)"},
        { "type": "input_field_text", "field_name": "api_text", "value": self.opts.apiKey||"", "label": "API from wunderground.com", "placeholder": self.opts.apiKey||"", "required": true},
        { "type": "input_field_text", "field_name": "zip_code_text", "value": self.opts.zipCode, "label": 'Zip Code or Location (i.e. "90210" or "CA/San_Francisco" or "Australia/Sydney" or "autoip")', "placeholder": self.opts.zipCode, "required": true},
        { "type": "input_field_select", "field_name": "use_fahrenheit_select", "label": "Temperature Type to Display", "options": [{ "name": "Fahrenheit", "value": true, "selected": self.opts.useFahrenheit}, { "name": "Celsius", "value": false, "selected": !self.opts.useFahrenheit}], "required": true },
        { "type": "input_field_text", "field_name": "forecast_hours_text", "value": self.opts.forecastHours, "label": "Number of hours to forecast (creates new devices for each hour increment)", "placeholder": self.opts.forecastHours, "required": true},
        { "type": "input_field_text", "field_name": "pause_aft_updt_secs_text", "value": self.opts.pauseAfterSetToUpdate/1000, "label": "Seconds to Pause After a Command Before Updating", "placeholder": self.opts.pauseAfterSetToUpdate/1000, "required": true},
        { "type": "input_field_text", "field_name": "update_interval_text", "value": self.opts.updateInterval/1000, "label": "How frequently to update data in seconds. (NOTE each update counts as an api call, so limit this per the number of calls per day your api plan allows)", "placeholder": self.opts.updateInterval/1000, "required": true},
        { "type": "paragraph", "text": " "},
        { "type": "submit", "name": "Submit", "rpc_method": "submt" },
        { "type": "close", "name": "Cancel" },
      ]
    });
  };
  if (rpc.method == "submt") {
    this._app.log.debug("weatherDriver config window submitted. Checking data for errors...");
    // check for errors
    /*
    if (!(rpc.params.zip_code_text >= 0)) { // zip_code_text must evaluate to a positive number or 0
      cb(null, {
        "contents": [
          { "type": "paragraph", "text": "zip code must be a number and can't be negative. Please try again." },
          { "type": "close"    , "name": "Close" }
        ]
      });     
      return;     
    }
    else if
    */
    if (rpc.params.api_text == "") {
      cb(null, {
        "contents": [
          { "type": "paragraph", "text": "api key is mandatory." },
          { "type": "close"    , "name": "Close" }
        ]
      });
      return;
    }
    var pauseAftUpdt = validateNumber(cb, rpc.params.pause_aft_updt_secs_text, 'pause after update interval');
    if (!pauseAftUpdt)
      return;
    var updateInterval = validateNumber(cb, rpc.params.update_interval_text, 'update interval');
    if (!updateInterval)
      return;
    var forecastHours = validateNumber(cb, rpc.params.forecast_hours_text, 'forecast hours');
    if (!forecastHours)
      return;

    // looks like the submitted values were valid, so update
    this._app.log.debug("weatherDriver data appears valid. Saving settings...");
    self.opts.apiKey = rpc.params.api_text;
    self.opts.zipCode = rpc.params.zip_code_text;
    if (typeof rpc.params.use_fahrenheit_select == 'string') {
      self.opts.useFahrenheit = rpc.params.use_fahrenheit_select == "true";
    } else {
      self.opts.useFahrenheit = rpc.params.use_fahrenheit_select;
    }
    self.opts.forecastHours = forecastHours;
    self.opts.pauseAftUpdt = pauseAftUpdt * 1000; // also need this in milliseconds
    self.opts.updateInterval = updateInterval * 1000; // also need this in milliseconds
    self.save();
    cb(null, {
      "contents": [
        { "type": "paragraph", "text": "Configuration was successful. weatherDriver values should update shortly!" },
        { "type": "close"    , "name": "Close" }
      ]
    });
    self.createDevices();
  }
  else {
    this._app.log.warn("weatherDriver - Unknown rpc method was called!");
  };
};

module.exports = Driver;
