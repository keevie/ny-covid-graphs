// server.js
// where your node app starts

// init project
const express = require("express");
const bodyParser = require("body-parser");
const app = express();
const fs = require("fs");
const axios = require("axios");
const cheerio = require("cheerio");
const crypto = require("crypto");

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// we've started you off with Express,
// but feel free to use whatever libs or frameworks you'd like through `package.json`.

// http://expressjs.com/en/starter/static-files.html
app.use(express.static("public"));

// init sqlite db
const dbFile = "./.data/sqlite.db";
const exists = fs.existsSync(dbFile);
const sqlite3 = require("sqlite3").verbose();
const db = new sqlite3.Database(dbFile);

const metricNames = [
  "region",
  "days-decline-hospitalizations",
  "max-daily-increase-hospitalizations",
  "days-decline-deaths",
  "max-daily-increase-deaths",
  "new-hospitalizations",
  "share-total-beds-available",
  "share-icu-beds-available",
  "average-testing-capacity",
  "necessary-testing-capacity",
  "contact tracers",
  "metrics-met",
  "metrics-met-total"
];
const createTableSQL = `
  CREATE TABLE Metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    Timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    ${metricNames.map(name => `'${name}' TEXT`).join(",\n")},
    DownloadId TEXT
  )
`;
// if ./.data/sqlite.db does not exist, create it, otherwise print records to console
db.serialize(() => {
  if (!exists) {
    console.log("create table sql", createTableSQL);
    db.run(createTableSQL);
  } else {
    db.each("SELECT * from Metrics", (err, row) => {
      if (row) {
        console.log(`record: ${row["metrics-met"]}`);
      }
    });
  }
});

// http://expressjs.com/en/starter/basic-routing.html
app.get("/", (request, response) => {
  response.sendFile(`${__dirname}/views/index.html`);
});

// endpoint to get all the dreams in the database
app.get("/getDreams", (request, response) => {
  db.all("SELECT * from Metrics", (err, rows) => {
    response.json(rows);
  });
});

const cleanDataPoint = dp => {
  return dp
    .trim()
    .replace(",", "")
    .replace("%", "");
};
const processDataPoint = dp => {
  let res;
  if (dp.includes("/")) {
    res = dp.split("/");
  } else {
    res = dp.split("|");
  }
  return res.map(cleanDataPoint);
};

const fetchData = async siteUrl => {
  const result = await axios.get(siteUrl);
  return cheerio.load(result.data);
};

const checkLatest = siteUrl => {
  //check if we have something for today already
  db.all(
    "SELECT Timestamp from Metrics order by Timestamp DESC limit 1",
    (err, rows) => {
      const today = new Date().toDateString();
      let latestDate = false;
      if (rows[0]) latestDate = new Date(rows[0].Timestamp).toDateString();
      if (true || latestDate !== today) {
        console.log("inserting new results");
        getResults(siteUrl);
      } else {
        console.log("already got today's results");
      }
    }
  );
};

const getResults = async siteUrl => {
  const $ = await fetchData(siteUrl);
  const tableBody = $("table tbody tr");

  const tableRows = [];
  tableBody.map((i, row) => {
    if (i >= 1) {
      const tableRow = [];
      for (const dataPoint of row.children) {
        if (
          $(dataPoint)
            .text()
            .trim()
        ) {
          tableRow.push(...processDataPoint($(dataPoint).text()));
        }
      }
      tableRows.push(tableRow);
    }
  });
  console.log("HASH!", hashString(JSON.stringify(tableRows)))
  //writeDataToDb(tableRows)
};

const writeDataToDb = dataRows => {
  
  const insertSQL = `
    INSERT INTO Metrics (${metricNames.map(surroundWithQuotes).join(",")})
    VALUES
      ${dataRows
        .map(row => `(${row.map(surroundWithQuotes).join(",")})`)
        .join(",")}
    ;
  `;
  db.serialize(() => {
    db.run(insertSQL);
  });
}

// endpoint to clear dreams from the database
app.get("/clearDreams", (request, response) => {
  checkLatest("https://forward.ny.gov/regional-monitoring-chart");

  return;
  // DISALLOW_WRITE is an ENV variable that gets reset for new projects so you can write to the database
  if (!process.env.DISALLOW_WRITE) {
    db.each(
      "SELECT * from Dreams",
      (err, row) => {
        console.log("row", row);
        db.run(`DELETE FROM Dreams WHERE ID=?`, row.id, error => {
          if (row) {
            console.log(`deleted row ${row.id}`);
          }
        });
      },
      err => {
        if (err) {
          response.send({ message: "error!" });
        } else {
          response.send({ message: "success" });
        }
      }
    );
  }
});

// helper function that prevents html/css/script malice
const cleanseString = function(string) {
  return string.replace(/</g, "&lt;").replace(/>/g, "&gt;");
};

const surroundWithQuotes = n => `'${n}'`;

const hashString = str => {
  return crypto.createHash('md5').update(str).digest('hex');
}

// listen for requests :)
var listener = app.listen(process.env.PORT, () => {
  console.log(`Your app is listening on port ${listener.address().port}`);
});
