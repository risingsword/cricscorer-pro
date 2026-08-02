const puppeteer = require('puppeteer-core');

(async () => {
    const browser = await puppeteer.launch({
        executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
        headless: true
    });
    const page = await browser.newPage();
    await page.goto("http://localhost:5173");

    // Wait for App load before accessing IndexedDB
    await new Promise(r => setTimeout(r, 2000));

    const result = await page.evaluate(async () => {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('CricScorerDB', 1);
            request.onerror = () => reject('Failed to open DB');
            
            request.onsuccess = (e) => {
                const db = e.target.result;
                const tx = db.transaction('matches', 'readwrite');
                const store = tx.objectStore('matches');
                const getReq = store.getAll();

                getReq.onsuccess = () => {
                    const matches = getReq.result;
                    if (matches.length === 0) {
                        resolve('No matches found to restore!');
                        return;
                    }

                    // Sort by timestamp if available, other latest element
                    const latestMatch = matches.sort((a,b) => (b.timestamp || 0) - (a.timestamp || 0))[0];
                    const inn1 = latestMatch.innings[0]; // 1st Innings

                    let shakti = inn1.bowlers.find(b => b.name?.toLowerCase() === 'shakti');
                    if (!shakti) {
                        inn1.bowlers.push({ name: 'shakti', overs: 2, runs: 22, wickets: 0, maidens: 0, fours: 0, sixes: 0 });
                    } else {
                        shakti.overs = 2;
                        shakti.runs = 22;
                    }

                    const putReq = store.put(latestMatch);
                    putReq.onsuccess = () => resolve('RESTORATION SUCCESSFUL FOR SHAKTI!');
                };
            };
        });
    });

    console.log(result);
    await browser.close();
})();
