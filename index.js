//
//
// Original code samuelmr/nordpool-ifttt
// 7.11.2017 PetriKarj, added dynamic intraday hours
//
//
const schedule = require('node-schedule');
const nordpool = require('nordpool');
const moment = require('moment-timezone');
const prices = new nordpool.Prices();
const config = require('./config');
const findStreak = require('findstreak');
const request = require('request');
const del = require('del');

const lowEvent = 'nordpool-price-low';
const normEvent = 'nordpool-price-normal';
const highEvent = 'nordpool-price-high';

const iftttUrl = 'https://maker.ifttt.com/trigger/';

let myTZ = moment.tz.guess();
let jobs = [];

// get latest prices immediately
getPrices();

// Prices for tomorrow are published today at 12:42 CET or later
// (http://www.nordpoolspot.com/How-does-it-work/Day-ahead-market-Elspot-/)
// update prices at 15:15 UTC
let cronPattern = moment.tz('15:15Z', 'HH:mm:Z', myTZ).format('m H * * *');
let getPricesJob = schedule.scheduleJob(cronPattern, getPrices);


//
// 7.11.2017 PeriKarj aadded min and max functions, idea from stackoverflow
//
function findIndicesOfMin(inp, count) {
    var outp = [];
    for (var i = 0; i < inp.length; i++) {
        outp.push(i); // add index to output array
        if (outp.length > count) {
            outp.sort(function(a, b) { return inp[a].value - inp[b].value; }); // descending sort the output array
            outp.pop(); // remove the last index (index of smallest element in output array)
        }
    }
    return outp;
}
function findIndicesOfMax(inp, count) {
    var outp = [];
    for (var i = 0; i < inp.length; i++) {
        outp.push(i); // add index to output array
        if (outp.length > count) {
            outp.sort(function(a, b) { return inp[b].value - inp[a].value; }); // ascending sort the output array
            outp.pop(); // remove the last index (index of largest element in output array)
        }
    }
    return outp;
}


function getPrices() {
  console.clear();
  prices.hourly(config, (error, results) => {
    if (error) {
      console.error(error);
      return;
    }
    let events = [];
    let tmpHours = [];
    let previousEvent = normEvent;

	console.log(results);
	var expensivehours=findIndicesOfMax(results,config.numLowHours);
	console.log(expensivehours);
	var cheaphours=findIndicesOfMin(results,config.numLowHours);
	console.log(cheaphours);

    results.forEach((item, index) => {
      let price = item.value; // float, EUR/MWh
	  item.event = normEvent;

	//
	// dynamic intraday cheap and expensive hours, added by PetriKarj 7.11.2017
	//
	  if (expensivehours.includes(index)) {
        item.event = highEvent;
      }
      else if (cheaphours.includes(index)) {
        item.event = lowEvent;
      };

	//
	// hardcoded threshold values
	//
 	  if (price > config.highTreshold) {
        item.event = highEvent;
      }
      else if (price < config.lowTreshold) {
        item.event = lowEvent;
      };

		item.date.tz(myTZ);

      if (item.event != previousEvent) {
        var max = 24;
        var lo = false;
        if (previousEvent == highEvent) {
          max = config.maxHighHours;
        }
        else if (previousEvent == lowEvent) {
          max = config.maxLowHours;
          var lo = true;
        }

        let rf = (a, b) => a + b.value;
        if (tmpHours.length > 0) {
          let streak = findStreak(tmpHours, max, rf, lo);
          events.push(streak[0]);
          if ((previousEvent != normEvent) && (streak.length < tmpHours.length)) {
            let firstIndex = streak[0].date.get('hours') - tmpHours[0].date.get('hours');
            if (firstIndex > 0) {
              tmpHours[0].event = normEvent;
              events.push(tmpHours[0]);
            }
            if (firstIndex < (tmpHours.length - streak.length)) {
              tmpHours[firstIndex + streak.length].event = normEvent;
              events.push(tmpHours[firstIndex + streak.length]);
            }
          }
        }
        previousEvent = item.event;
        tmpHours = [];
      }
      else if (index == results.length - 1) {
        events.push(tmpHours[0]);
      }
      tmpHours.push(item);
	  console.log(item.date.format('H:mm'), item.value, item.event)
    });
    console.log(events);
    events.forEach(item => {
      jobs.push(schedule.scheduleJob(item.date.toDate(), trigger.bind(null, item)));
      console.log(item.date.format('H:mm'), item.value, item.event)
    });
  });
}

function trigger(item) {
  let values = {
    value1: item.value,
    value2: config.currency + '/MWh',
    value3: item.date.format('H:mm')
  };
  var opts = {
    url: iftttUrl + item.event + '/with/key/' + config.iftttKey,
    json: true,
    body: values
  };
  console.log('POSTing ' + item.event + ' event: ' + values.value1 + ' ' + values.value2 + ' at ' + values.value3);
  request.post(opts, function(err, res) {
    if (err) {
      console.error(err);
      return;
    }
    console.log('Success: ' + res.body)
  })
}
