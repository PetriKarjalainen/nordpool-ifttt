//
//
// Original code samuelmr/nordpool-ifttt
//
// 11.2017 PetriKarj, added dynamic intraday hours
// source: https://github.com/PetriKarjalainen/nordpool-ifttt
//
// node v8.9 for Arm7 is Needed, here instructions to install node
// cd /root
// wget https://nodejs.org/dist/v8.9.1/node-v8.9.1-linux-armv7l.tar.xz
// tar xvf ./node-v8.9.1-linux-armv7l.tar.xz
// rm ./node-v8.9.1-linux-armv7l.tar.xz
// mv node-v8.9.1-linux-armv7l.tar.xz node
// cd /etc
// echo "export PATH=\$PATH:/root/node/bin" >> .profile
//
// excellent tool to start node app at reboot is: https://github.com/chovy/node-startup
// init.d for synology is at: /usr/local/etc/rc.d/ and needs to be .sh filetype
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

//
// Needed for Tellstick Zwave Net local access within LAN
// to be added later
//
const { LiveApi } = require('telldus-api');
const api = require('tellstick-local-server');


// Prices for tomorrow are published today at around 12:42 CET or later
// anyhow lets fetch the prices during the last area FIN local hour
// so that if this program is started earlier the current day prices are used
// for remaining day
var cronPattern = moment.tz('22:15Z', 'HH:mm:Z', myTZ).format('m H * * *');
var getPricesJob = schedule.scheduleJob(cronPattern, getPrices);

// get latest prices immediately for today
getPrices();

//
// Need to check if internet connectivity is ok, otherwise prices.js can throw an error
//
function checkInternet(cb) {
  require('dns').lookup('nordpool.com',function(err) {
    if (err && err.code == "ENOTFOUND") {
      cb(false);
    } else {
      cb(true);
    }
  })
}

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
  var Average =0; // average electricity day price
  var counterAverage=0;  // counter for average
  var tvalue = -1;
  var tevent = "";
  var tdate = 0;
  var triggeritem =""; //This is needed in case we need to trigger already elapsed item
  var currentHour = new Date().getUTCHours();
  var now = new Date();
  console.log('Running at (UTC) ',now);
  var today = moment(now.setDate(now.getDate()), config.dateFormats).format('YYYY-MM-DD')+'T23:00:00'
  config.to=today;
  config.date=today;


  checkInternet(function(isConnected) {
    if (isConnected) {
      // connected to the internet
      prices.hourly(config, (error, results) => {
        if (error) {
          console.error(error);
          console.log("Prices.js threw an error, can not run this time. Retry in 15 minutes")
          schedule.scheduleJob(now.setMinutes(now.getMinutes()+5), getPrices.bind(null));
          return;
        }
        //console.log(config);

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
            //
            // Oh gosh, sometimes the event may need to have been executed because
            // it occured in the past. In that case just send it directly otherwise
            // if event is for future then push it to scheduler.
            //
            if (item.date < now){
              triggeritem=item;
            }
            else {
              jobs.push(schedule.scheduleJob(item.date.toDate(), trigger.bind(null, item)));
              console.log('Scheduling:    ',item.date.format('dddd H:mm'), item.value, item.event);
            }
            previousEvent=item.event;
          }
        });
      //
      // Now trigger if an already elapsed item is found
      //
      if (triggeritem != "") {trigger(triggeritem);}
      }

    );
  }
  else {
    //
    // Nordpool or internet down, lets just retry again...
    //
    console.log("Nordpool.com not reachable, can not run this time. Retry in 15 minutes")
    schedule.scheduleJob(now.setMinutes(now.getMinutes()+15), getPrices.bind(null));
    return;
  }
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
    //    console.log('Success: ' + res.body)
  })
}
