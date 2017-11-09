module.exports = {
//
// Note: First numHighHours highest priced hours are selected and numLowHours lowest numLowHours
// The dynamically selected highHours need to be threshold(%) higher than daily average.
// Then hours are selected by hardcoded limits. After selecting hours Then
// if there is consequent maxHighHours or maxLowHours then at least one normally priced hours is inserted before next high or low hour
//
  area: 'FI', // see http://www.nordpoolspot.com/maps/
  currency: 'EUR', // can also be 'DKK', 'NOK', 'SEK'
  highTreshold: 45, // hardcoded high cost limit, send event when price > highTreshold EUR/MWh
  lowTreshold: 25, // hardcoded low cost limit, send event when price < lowTreshold EUR/MWh
  numHighHours: 4, // dynamic intraday high cost hours, i.e. every day X number of hours defined as low cost hours
  numLowHours: 4,  // dynamic intraday low cost hours, i.e. every day X number of hours defined as low cost hours
  maxHighHours: 2, // max consecutive high hours
  maxLowHours: 24, // max consecutive low hours
  threshold: 10,  // price needs to be x% over average daily priceto  triggers highevent
  iftttKey: 'dOTZVRckkGqpls1ofYDadm' // see https://ifttt.com/services/maker_webhooks/settings
};
