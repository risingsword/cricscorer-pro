const puppeteer = require('puppeteer-core');

(async () => {
    const browser = await puppeteer.launch({
        executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
        headless: true
    });
    const page = await browser.newPage();
    try {
        await page.goto("http://localhost:5173");
        await new Promise(r => setTimeout(r, 2000));

        const result = await page.evaluate(async () => {
             let found = false;
             for (let i = 0; i < localStorage.length; i++) {
                 const key = localStorage.key(i);
                 if (key.includes('cricscorer_') && key.includes('_match_')) {
                     try {
                         const matchStr = localStorage.getItem(key);
                         const match = JSON.parse(matchStr);

                         if (match.innings && match.innings[0]) {
                             const inn1 = match.innings[0];
                             let shakti = inn1.bowlers.find(b => b.name?.trim().toLowerCase() === 'shakti');

                             if (!shakti) {
                                 inn1.bowlers.push({ name: 'shakti', overs: 2, runs: 22, wickets: 0, maidens: 0, fours: 0, sixes: 0 });
                             } else {
                                 shakti.overs = 2; shakti.runs = 22;
                             }

                             localStorage.setItem(key, JSON.stringify(match));
                             found = true;
                         }
                     } catch(err) { }
                 }
             }
             
             // Also restore inside live match key if active
             const liveStr = localStorage.getItem('cricscorer_live_match');
             if (liveStr) {
                 try {
                     const liveMatch = JSON.parse(liveStr);
                     if (liveMatch.innings && liveMatch.innings[0]) {
                         const inn1 = liveMatch.innings[0];
                         let shakti = inn1.bowlers.find(b => b.name?.trim().toLowerCase() === 'shakti');
                         if (!shakti) {
                             inn1.bowlers.push({ name: 'shakti', overs: 2, runs: 22, wickets: 0, maidens: 0, fours: 0, sixes: 0 });
                         } else {
                             shakti.overs = 2; shakti.runs = 22;
                         }
                         localStorage.setItem('cricscorer_live_match', JSON.stringify(liveMatch));
                         found = true;
                     }
                 } catch(e) {}
             }

             return found ? 'RESTORATION SUCCESSFUL FOR SHAKTI!' : 'No match data found in localStorage!';
        });

        console.log(result);
    } catch (err) {
        console.error("Puppeteer Script Error:", err);
    } finally {
        await browser.close();
    }
})();
