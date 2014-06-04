var hourlyForecast = function(opts)
{
  var forecasts = [];
  
  	forecasts.push({
      name: 'Weather Current Humidity',
      deviceId: 9,
      data: [function(weatherDataToParse, useFahrenheit) {
          return (weatherDataToParse.current_observation.relative_humidity).replace(/[^0-9]/g, '');
      }],
      canSet: false
	});
	forecasts.push({
      name: 'Weather Current Solarradiation',
      deviceId: 9,
      data: [function(weatherDataToParse, useFahrenheit) {
          return weatherDataToParse.current_observation.solarradiation;
      }],
      canSet: false
	});
	forecasts.push({
      name: 'Weather Current UV',
      deviceId: 9,
      data: [function(weatherDataToParse, useFahrenheit) {
          return weatherDataToParse.current_observation.UV;
      }],
      canSet: false
	});
	forecasts.push({
      name: 'Weather Today Rain',
      deviceId: 9,
      data: [function(weatherDataToParse, useFahrenheit) {
          return weatherDataToParse.current_observation.precip_today_metric;
      }],
      canSet: false
	});
	
  for (var i = 0; i < opts.forecastHours; i++) {
    (function(i) {
      forecasts.push({
        name: 'Weather Forecast Temperature '+(i+1)+'h',
        deviceId: 9,
        data: [function(weatherDataToParse, useFahrenheit) {
          if (useFahrenheit) {
            return weatherDataToParse.hourly_forecast[i].temp.english;
          }
          else {
            return weatherDataToParse.hourly_forecast[i].temp.metric;
          }
        }],
        canSet: false
      });
      forecasts.push({
        name: 'Weather Forecast Pop '+(i+1)+'h',
        deviceId: 9,
        data: [function(weatherDataToParse, useFahrenheit) {
          return weatherDataToParse.hourly_forecast[i].pop;
        }],
        canSet: false
      });
      forecasts.push({
        name: 'Weather Forecast FctCode '+(i+1)+'h',
        deviceId: 9,
        data: [function(weatherDataToParse, useFahrenheit) {
          return weatherDataToParse.hourly_forecast[i].fctcode;
        }],
        canSet: false
      });
      forecasts.push({
        name: 'Weather Forecast Uvi '+(i+1)+'h',
        deviceId: 9,
        data: [function(weatherDataToParse, useFahrenheit) {
          return weatherDataToParse.hourly_forecast[i].uvi;
        }],
        canSet: false
      });
      forecasts.push({
        name: 'Weather Forecast Humidity '+(i+1)+'h',
        deviceId: 9,
        data: [function(weatherDataToParse, useFahrenheit) {
          return weatherDataToParse.hourly_forecast[i].humidity;
        }],
        canSet: false
      });
      forecasts.push({
        name: 'Weather Forecast Condition '+(i+1)+'h',
        deviceId: 244,
        data: [function(weatherDataToParse, useFahrenheit) {
          return weatherDataToParse.hourly_forecast[i].condition;
        }],
        canSet: false
      });
    })(i);
  }
  return forecasts;
}

module.exports = function(opts) {
  return [
    {
      name: 'Weather Current Temperature',
      deviceId: 9,
      data: [function(weatherDataToParse, useFahrenheit) {
        if (useFahrenheit) {
          return weatherDataToParse.current_observation.temp_f;
        }
        else {
          return weatherDataToParse.current_observation.temp_c;
        }
      }],
      canSet: false
    }
  ].concat(hourlyForecast(opts));
}

/*
  name: string - the name of the device
  deviceId: number - the device id of the device - see http://ninjablocks.com/pages/device-ids
  data: function to call which will return parsed date when given ((json object)weatherDataToParse, (bool)useFahrenheit) as arguments
  canSet: boolean - set to true if device is writable
  setStg: a function to call if device is writable upon write which will return a string of the command to execute, given ((string)apiKey, (string)val) as arguments
*/
