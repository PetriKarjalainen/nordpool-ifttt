module.exports = {
  area: 'FI', // see http://www.nordpoolspot.com/maps/
  currency: 'EUR', // can also be 'DKK', 'NOK', 'SEK'
  highTreshold: 100, // hardcoded high cost limit, send event when price > highTreshold EUR/MWh
  lowTreshold: 10, // hardcoded low cost limit, send event when price < lowTreshold EUR/MWh
  maxHighHours: 2, // max consecutive high hours
  maxLowHours: 24, // max consecutive low hours
  numHighHours: 4, // dynamic intraday high cost hours, i.e. every day X number of hours defined as low cost hours
  numLowHours: 4, // dynamic intraday low cost hours, i.e. every day X number of hours defined as low cost hours
  iftttKey: 'ADDYOURKEYHERE' // see https://ifttt.com/services/maker_webhooks/settings
};
