//
//
// Original code samuelmr/nordpool-ifttt
// 7.11.2017 PetriKarj, added dynamic intraday hours
// source: https://github.com/PetriKarjalainen/nordpool-ifttt
//
//
const schedule = require('node-schedule');
const nordpool = require('nordpool');
const moment = require('moment-timezone');
const prices = new nordpool.Prices();
const config = require('./config');
const findStreak = require('findstreak');
const request = require('request');
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
// update prices at 22:30UTC for coming day, its just LAST hour of a elspot system day
let cronPattern = moment.tz('22:30Z', 'HH:mm:Z', myTZ).format('m H * * *');
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
  let Average =0; // average electricity day price
  let counterAverage=0;  // counter for average

  let now = new Date();
  console.log('Getprices run at (UTC) ',now);
  // config.to is needed fr prices.js, otherwise day may not be correct
  let today = moment(now.setDate(now.getDate()), config.dateFormats).format('YYYY-MM-DD')+'T23:00:00'
  config.to=today;

  prices.hourly(config, (error, results) => {
    if (error) {
      console.error(error);
      return;
    }
    let events = [];
    let tmpHours = [];
    let previousEvent = normEvent;
    let counterHighEvent=0;
    let counterLowEvent=0;

	//console.log(results);
	var expensivehours=findIndicesOfMax(results,config.numHighHours);
	console.log('CET Expensive hours: ' + expensivehours);
	var cheaphours=findIndicesOfMin(results,config.numLowHours);
	console.log('CET Cheap hours: ' + cheaphours);

  //
  // lets calculate daily average price, needed for determining if price really is high
  //
  results.forEach((item, index) => {

      Average= item.value+Average;
      counterAverage++;
  })
  Average=Average/counterAverage;

  //
  // Classify prices to categories and define event type
  //
  results.forEach((item, index) => {

      let price = item.value; // float, EUR/MWh
	    item.event = normEvent;

	   //
	   // dynamic intraday cheap and expensive hours, added by PetriKarj 7.11.2017
	   //
	   if (expensivehours.includes(index)) {
         if((price/Average) > (1+(config.threshold/100))) {
           item.event = highEvent;
         }
       }
     if (cheaphours.includes(index)) {
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

       //
       // Lets check that the amount of consequent hours is not exceeded
       // config.maxHighHours, config.maxLowHours
       //
       if (item.event === previousEvent){
         if(item.event === highEvent){
           counterHighEvent++;
           if (counterHighEvent >= config.maxHighHours){
             item.event=normEvent;
             counterHighEvent=0;
           }
         }
         if (item.event === lowEvent){
           counterLowEvent++;
           if (counterLowEvent >= config.maxLowHours){
             item.event=normEvent;
             counterLowEvent=0;
           }
         }
       }
       else {
         counterHighEvent=0;
         counterLowEvent=0;
       }
       previousEvent=item.event;
       events.push(item);
       //       console.log('CET: ', item.date.format('H:mm'), item.value, item.event)
    });


      //
      // Schedule events in local timezone
      //
      events.forEach(item => {
      if(item.event === previousEvent){
        // dont post anything as event is already active
      }
      else {
        item.date.tz(myTZ);
        jobs.push(schedule.scheduleJob(item.date.toDate(), trigger.bind(null, item)));
        console.log('Scheduling: ',item.date.format('dddd H:mm'), item.value, item.event);
        previousEvent=item.event;
        }
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
