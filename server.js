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

  for (let i = 0; i < sites.length; i++) {
    const site = sites[i];
    console.log('Begin scrapping '+ site);

    // Call scraping function dynamically using the variable
    const data = await functions[site]();

    bets = bets.concat(data);

    console.log('End scrapping '+ site);
  }

  const matchedBets = await calculate(bets);

  // console.log(matchedBets);

  console.log('Scrape done!');
  res.json(matchedBets);
});


async function calculate(matches) {
  let returnData = [];

  // get matches
  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    returnData[i] = [];
    returnData[i].push(match);

    const bookmaker = match.bookmaker;
    const startTime = match.startTime;

    for (const teamOdds of match.teamOdds) {
      if (teamOdds.team !== 'draw') {
        const matchedBet = matches.find((mb) =>
          mb.startTime === startTime &&
          mb.bookmaker !== bookmaker &&
          mb.teamOdds.some((odds) => odds.team === teamOdds.team)
        );

        if (matchedBet != undefined) {
          returnData[i].push(matchedBet);
          break;
        }
      }
    }
  }

  // Make a copy of returnData to avoid modifying the original array
  returnData = JSON.parse(JSON.stringify(returnData));

  // get best odds
  for (let i = 0; i < returnData.length; i++) {
    const match = returnData[i];
    let bestOdds = [];

    for (const bet of match) {
      for (const teamOdds of bet.teamOdds) {
        teamOdds.bookmaker = bet.bookmaker;
        const existingTeam = bestOdds.find(
          (odds) =>
            odds.team.includes(teamOdds.team) || teamOdds.team.includes(odds.team)
        );

        if (!existingTeam) {
          bestOdds.push(teamOdds);
        } else {
          if (parseFloat(existingTeam.odds) < parseFloat(teamOdds.odds)) {
            existingTeam.odds = teamOdds.odds;
            existingTeam.bookmaker = bet.bookmaker;
          }
        }
      }
    }

    returnData[i] = bestOdds;
  }

  // calculate arbitrage
  const arbitrageData = await calculateArbitrage(returnData);

  return arbitrageData;
}



function calculateArbitrage(data, amount = 10) {
  let newData = [];
  for (let bet of data) {
    const odds = bet.map((teamOdds) => parseFloat(teamOdds.odds));
    const probabilities = [];
    const stakes = [];
    const roundedStakes = [];
    let totalProb = 0;

    // Calculate the sum of the inverse of odds
    const sumInverseOdds = odds.reduce((carry, odd) => {
      if (odd === 0) {
        return carry; // If the odd is 0, return the current carry value
      }
      return carry + 1 / odd;
    }, 0);
    

    // Calculate the stake for each bet based on probabilities
    for (const odd of odds) {
      const probability = (odd === 0) ? 0 : (1 / odd) / sumInverseOdds;
      const stake = amount * probability;
      probabilities.push(probability);
      stakes.push(stake);
      roundedStakes.push(Math.round(stake * 100) / 100);
      totalProb += probability;
    }

    console.log(stakes);

    const returns = [];
    // Adjust the stake amounts to ensure the total does not exceed amount
    const multiplier = amount / (stakes.reduce((sum, stake) => sum + stake) * totalProb);
    for (let i = 0; i < stakes.length; i++) {
      returns.push(Math.round(stakes[i] * odds[i] * 100) / 100);
      stakes[i] = Math.round(stakes[i] * multiplier * 100) / 100;
    }

    const stakedSum = roundedStakes.reduce((sum, stake) => sum + stake)
    const profit = Math.round((returns[0] - stakedSum) * 100) / 100

    newData.push({
      teamOdds: bet,
      stakes: stakes,
      stakesRoudned: roundedStakes,
      returns: returns,
      stakedSum: stakedSum,
      profit: profit
    });
  }

  // Sort the data based on the 'profit' key in descending order
  newData.sort((a, b) => Math.abs(a.profit) - Math.abs(b.profit));

  return newData;
}







// Common function to launch browser and navigate to a page
async function launchBrowser(url) {
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();
  await page.goto(url);
  return { browser, page };
}

// Common function to close the browser
async function closeBrowser(browser) {
  await browser.close();
}


// Define your functions
const functions = {

  async check() {
    const { browser, page } = await launchBrowser('https://bot.sannysoft.com/');

    await page.screenshot({ path: 'check.png' });

    await closeBrowser(browser);
    return [];
  },


  async unibet() {
    const { browser, page } = await launchBrowser('https://www.unibet.nl/sportsbook-feeds/views/filter/football/netherlands/eredivisie/all/matches', { headless: false });
  
    // Wait for the JSON data to load
    await page.waitForSelector('pre');
  
    // Extract the JSON data
    const dirtyBets = await page.evaluate(() => {
      const preElement = document.querySelector('pre');
      return JSON.parse(preElement.textContent).layout.sections[1].widgets[0].matches.events;
    });
  
    const cleanBets = dirtyBets.map(dirtyBet => {
      const event = dirtyBet.event;
      const betOffers = dirtyBet.betOffers;
  
      const startTime = Date.parse(event.start); // Convert start time to timestamp
  
      // Create an array with team names and their odds
      const teamOdds = (betOffers[0]?.outcomes || []).map(outcome => ({
        team: outcome?.participant?.toLowerCase() || 'draw',
        odds: outcome?.oddsDecimal || 0
      }));      
  
      return {
        'bookmaker': 'unibet',
        startTime,
        teamOdds
      };
    });
  
    await closeBrowser(browser);
    return cleanBets;
  },


  async toto() {
    const { browser, page } = await launchBrowser('https://content.toto.nl/content-service/api/v1/q/time-band-event-list?maxMarkets=100&marketSortsIncluded=--%2CCS%2CDC%2CDN%2CHH%2CHL%2CMH%2CMR%2CWH&marketGroupTypesIncluded=CUSTOM_GROUP%2CDOUBLE_CHANCE%2CDRAW_NO_BET%2CMATCH_RESULT%2CMATCH_WINNER%2CMONEYLINE%2CROLLING_SPREAD%2CROLLING_TOTAL%2CSTATIC_SPREAD%2CSTATIC_TOTAL&allowedEventSorts=MTCH&includeChildMarkets=true&prioritisePrimaryMarkets=true&includeCommentary=true&includeMedia=true&drilldownTagIds=1176&maxTotalItems=600&maxEventsPerCompetition=70&maxCompetitionsPerSportPerBand=30&maxEventsForNextToGo=50&startTimeOffsetForNextToGo=600', { headless: false });
  
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
  
    await closeBrowser(browser);
    return cleanBets;
  },


  async bet365() {
    const { browser, page } = await launchBrowser('https://www.bet365.nl/#/AC/B1/C1/D1002/E76947770/G40/', { headless: false });
  
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
  
    await closeBrowser(browser);
    return cleanBets;
  },


};

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
