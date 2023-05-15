const express = require('express');
const app = express();
const port = 3000;

const bodyParser = require('body-parser');
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const puppeteer = require('puppeteer-extra')
const StealthPlugin = require('puppeteer-extra-plugin-stealth')
puppeteer.use(StealthPlugin());

app.post('/scrape', async (req, res) => {
  let bets = [];
  let sites = req.body;
  console.log(sites);

  // Execute scraping functions asynchronously
  const scrapingPromises = sites.map(async (site) => {
    console.log('Begin scraping ' + site);

    // Call the scraping function dynamically using the variable
    const data = await functions[site]();
    return data;
  });

  // Wait for all scraping promises to resolve
  const scrapedData = await Promise.all(scrapingPromises);

  // Concatenate the scraped data into the bets array
  bets = scrapedData.reduce((acc, data) => acc.concat(data), []);

  console.log('All scraping completed');

  bets = await getMatches(bets);
  bets = await getBestOdds(bets);
  bets = await calculateArbitrage(bets, 10);

  console.log('Scrape done!');
  res.json(bets);
});



function getMatches(data) {
  data.map((match) => ({
    ...match,
    teamOdds: match.teamOdds.sort((a, b) => a.team.localeCompare(b.team))
  }));

  let newData = [];
  let matchingKeys = [];

  for (let i = 0; i < data.length; i++) {
    const match = data[i];
    if (matchingKeys.includes(i)) {
      continue;
    }
    for (let i2 = 0; i2 < match.teamOdds.length; i2++) {
      const teamOdds = match.teamOdds[i2];
      if(teamOdds.team != 'draw') {
        const matchingTeams = data.filter((otherMatch, index) =>
          index !== i &&
          otherMatch.startTime === match.startTime &&
          otherMatch.teamOdds.some((odds) => odds.team === teamOdds.team)
        );

        if(matchingTeams) {
          matchingTeams.push(match);
          const matchedIndices = matchingTeams.map((team) => data.indexOf(team)).sort((a, b) => b - a);
          matchingKeys.push(...matchedIndices);
          newData.push(matchingTeams);
        }
        else{
          newData.push(match);
        }
        break;
      }
    }
  }

  return newData;
}


function getBestOdds(data) {
  let newData = [];

  for (let i = 0; i < data.length; i++) {
    const match = data[i];

    const dateFormat = new Date(match[0].startTime);
    const dateToString = dateFormat.toLocaleString();

    newData[i] = {
      startTime: dateToString,
      highestOdds: [],
      bets: []
    };

    for (let i2 = 0; i2 < match[0].teamOdds.length; i2++) {
      const teamOdds = match[0].teamOdds[i2];
      const odds = match.map((bet) => parseFloat(bet.teamOdds[i2].odds));

      const highestOddsIndices = [];
      let highestOddsValue = '';

      const maxOdds = Math.max(...odds);
      for (let i = 0; i < odds.length; i++) {
        if (odds[i] === maxOdds) {
          highestOddsIndices.push(i);
          highestOddsValue = odds[i];
        }
      }

      const highestOddsBookmakers = highestOddsIndices.map((index) => match[index].bookmaker);
      const highestOddsBookmaker = highestOddsBookmakers.join(', ');

      newData[i].bets = match;

      newData[i].highestOdds.push({
        bookmaker: highestOddsBookmaker,
        team: teamOdds.team,
        odds: highestOddsValue
      });
    }
  }

  return newData;
}


function calculateArbitrage(data, amount = 10) {
  for (let bet of data) {
    let sumStake = 0;
    const highestOdds = bet.highestOdds;
    const sumInverseOdds = highestOdds.reduce((total, odd) => total + 1 / parseFloat(odd.odds), 0);

    for (let i = 0; i < highestOdds.length; i++) {
      const highestOdd = highestOdds[i];
      const odd = parseFloat(highestOdd.odds);
      const impliedProbability = 1 / odd;
      const stake = (amount / sumInverseOdds) / odd;
      const potentialProfit = stake * odd - amount;

      sumStake += stake;

      bet.highestOdds[i].impliedProbability = impliedProbability.toFixed(2);
      bet.highestOdds[i].potentialProfit = potentialProfit.toFixed(2);
      bet.highestOdds[i].stake = stake.toFixed(2);
    }

    bet.staked = sumStake;
    bet.profit = Math.floor((bet.staked * sumInverseOdds - bet.staked) * 100) / -100;
    bet.profit = bet.profit.toFixed(2);    
  }

  data.sort((a, b) => Math.abs(a.profit) - Math.abs(b.profit));

  return data;
}

// Common function to launch browser and navigate to a page
async function launchBrowser(url) {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.goto(url);
  return { browser, page };
}

// Common function to close the browser
async function closeBrowser(browser) {
  await browser.close();
}

const defaultVisitsNames = [
  'football/netherlands/eredivisie',
  'football/italy/serie_a',
  'football/england/premier_league',
  'football/spain/la_liga',
  'football/germany/bundesliga',
];

function defaultVisits(name) {
  let visits = [];
  for (let i = 0; i < defaultVisitsNames.length; i++) {
    const visitName = defaultVisitsNames[i];
    visits.push("https://eu-offering-api.kambicdn.com/offering/v2018/"+name+'/listView/'+visitName+'/all/matches.json?lang=nl_NL&market=NL');
  }
  console.log(visits);
  return visits;
}

async function defaultDataCall(visits, bookmaker) {
  let bets = [];
  for (let i = 0; i < visits.length; i++) {
    const visit = visits[i];

    const { browser, page } = await launchBrowser(visit);
  
  // Wait for the JSON data to load
  await page.waitForSelector('pre');

  // Extract the JSON data
  const dirtyBets = await page.evaluate(() => {
    const preElement = document.querySelector('pre');
    return JSON.parse(preElement.textContent).events;
  });

  const cleanBets = dirtyBets.map(dirtyBet => {
    const startTime = Date.parse(dirtyBet.event.start);
    const betOffers = dirtyBet.betOffers[0];

    // Create an array with team names and their odds
    const teamOdds = betOffers.outcomes.map(outcome => ({
      team: outcome?.participant?.toLowerCase() || 'draw',
      odds: (outcome.odds / 1000).toFixed(2)
    }));

    return {
      'bookmaker': bookmaker,
      startTime,
      teamOdds
    };
  });
  bets = bets.concat(cleanBets);
  await closeBrowser(browser);
  }
  return bets;
}


// Define your functions
const functions = {

  async test() {
    const { browser, page } = await launchBrowser('https://bot.sannysoft.com/');
    await page.screenshot({ path: 'test.png' });
    await closeBrowser(browser);
    return [];
  },


  async unibet() {
    return await defaultDataCall(defaultVisits('ubnl'), 'unibet');
  },

  async betcity() {
    return await defaultDataCall(defaultVisits('betcitynl'), 'betcity');
  },

  async jacks() {
    return await defaultDataCall(defaultVisits('jvh'), 'jacks');
  },

  async livescorebet() {

  },

  
  async toto() {
    const visits = [
      // Serie A
      'https://content.toto.nl/content-service/api/v1/q/time-band-event-list?maxMarkets=10&marketSortsIncluded=--%2CCS%2CDC%2CDN%2CHH%2CHL%2CMH%2CMR%2CWH&marketGroupTypesIncluded=CUSTOM_GROUP%2CDOUBLE_CHANCE%2CDRAW_NO_BET%2CMATCH_RESULT%2CMATCH_WINNER%2CMONEYLINE%2CROLLING_SPREAD%2CROLLING_TOTAL%2CSTATIC_SPREAD%2CSTATIC_TOTAL&allowedEventSorts=MTCH&includeChildMarkets=true&prioritisePrimaryMarkets=true&includeCommentary=true&includeMedia=true&drilldownTagIds=644&maxTotalItems=60&maxEventsPerCompetition=7&maxCompetitionsPerSportPerBand=3&maxEventsForNextToGo=5&startTimeOffsetForNextToGo=600&dates=2023-05-16T22%3A00%3A00Z%2C2023-05-17T22%3A00%3A00Z%2C2023-05-18T22%3A00%3A00Z',
      // eredivisie
      'https://content.toto.nl/content-service/api/v1/q/time-band-event-list?maxMarkets=100&marketSortsIncluded=--%2CCS%2CDC%2CDN%2CHH%2CHL%2CMH%2CMR%2CWH&marketGroupTypesIncluded=CUSTOM_GROUP%2CDOUBLE_CHANCE%2CDRAW_NO_BET%2CMATCH_RESULT%2CMATCH_WINNER%2CMONEYLINE%2CROLLING_SPREAD%2CROLLING_TOTAL%2CSTATIC_SPREAD%2CSTATIC_TOTAL&allowedEventSorts=MTCH&includeChildMarkets=true&prioritisePrimaryMarkets=true&includeCommentary=true&includeMedia=true&drilldownTagIds=1176&maxTotalItems=600&maxEventsPerCompetition=70&maxCompetitionsPerSportPerBand=30&maxEventsForNextToGo=50&startTimeOffsetForNextToGo=600',
      // premier leauge
      'https://content.toto.nl/content-service/api/v1/q/time-band-event-list?maxMarkets=10&marketSortsIncluded=--%2CCS%2CDC%2CDN%2CHH%2CHL%2CMH%2CMR%2CWH&marketGroupTypesIncluded=CUSTOM_GROUP%2CDOUBLE_CHANCE%2CDRAW_NO_BET%2CMATCH_RESULT%2CMATCH_WINNER%2CMONEYLINE%2CROLLING_SPREAD%2CROLLING_TOTAL%2CSTATIC_SPREAD%2CSTATIC_TOTAL&allowedEventSorts=MTCH&includeChildMarkets=true&prioritisePrimaryMarkets=true&includeCommentary=true&includeMedia=true&drilldownTagIds=567&maxTotalItems=60&maxEventsPerCompetition=7&maxCompetitionsPerSportPerBand=3&maxEventsForNextToGo=5&startTimeOffsetForNextToGo=600&dates=2023-05-16T22%3A00%3A00Z%2C2023-05-17T22%3A00%3A00Z%2C2023-05-18T22%3A00%3A00Z',
      // LaLiga
      'https://content.toto.nl/content-service/api/v1/q/time-band-event-list?maxMarkets=10&marketSortsIncluded=--%2CCS%2CDC%2CDN%2CHH%2CHL%2CMH%2CMR%2CWH&marketGroupTypesIncluded=CUSTOM_GROUP%2CDOUBLE_CHANCE%2CDRAW_NO_BET%2CMATCH_RESULT%2CMATCH_WINNER%2CMONEYLINE%2CROLLING_SPREAD%2CROLLING_TOTAL%2CSTATIC_SPREAD%2CSTATIC_TOTAL&allowedEventSorts=MTCH&includeChildMarkets=true&prioritisePrimaryMarkets=true&includeCommentary=true&includeMedia=true&drilldownTagIds=570&maxTotalItems=60&maxEventsPerCompetition=7&maxCompetitionsPerSportPerBand=3&maxEventsForNextToGo=5&startTimeOffsetForNextToGo=600&dates=2023-05-16T22%3A00%3A00Z%2C2023-05-17T22%3A00%3A00Z%2C2023-05-18T22%3A00%3A00Z',
      // bundesliga
      'https://content.toto.nl/content-service/api/v1/q/time-band-event-list?maxMarkets=10&marketSortsIncluded=--%2CCS%2CDC%2CDN%2CHH%2CHL%2CMH%2CMR%2CWH&marketGroupTypesIncluded=CUSTOM_GROUP%2CDOUBLE_CHANCE%2CDRAW_NO_BET%2CMATCH_RESULT%2CMATCH_WINNER%2CMONEYLINE%2CROLLING_SPREAD%2CROLLING_TOTAL%2CSTATIC_SPREAD%2CSTATIC_TOTAL&allowedEventSorts=MTCH&includeChildMarkets=true&prioritisePrimaryMarkets=true&includeCommentary=true&includeMedia=true&drilldownTagIds=577&maxTotalItems=60&maxEventsPerCompetition=7&maxCompetitionsPerSportPerBand=3&maxEventsForNextToGo=5&startTimeOffsetForNextToGo=600&dates=2023-05-16T22%3A00%3A00Z%2C2023-05-17T22%3A00%3A00Z%2C2023-05-18T22%3A00%3A00Z',
    ];

    let bets = [];

    for (let i = 0; i < visits.length; i++) {
      const visit = visits[i];

      const { browser, page } = await launchBrowser(visit);

      // Wait for the JSON data to load
      await page.waitForSelector('pre');
    
      // Extract the JSON data
      const dirtyBets = await page.evaluate(() => {
        const preElement = document.querySelector('pre');
        return JSON.parse(preElement.textContent).data.timeBandEvents.flatMap((bet) => bet.events);
      });

      const cleanBets = dirtyBets.map(dirtyBet => {
      const event = dirtyBet;
      const betOffers = dirtyBet.markets[0];
    
      const startTime = Date.parse(event.startTime); // Convert start time to timestamp
    
      // Create an array with team names and their odds
      const teamOdds = betOffers.outcomes.map(outcome => ({
        team: outcome.name.toLowerCase(),
        odds: outcome.prices[0].decimal
      }));
    
      return {
        'bookmaker': 'toto',
        startTime,
        teamOdds
      };
    });

      bets = bets.concat(cleanBets);
      
      await closeBrowser(browser);
    }

    return bets;
  },


};

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
