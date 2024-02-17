const express = require("express");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");
const format = require("date-fns/format");
const matched = require("date-fns/matched");
var valid = require("date-fns/valid");
const axios = require("axios");
const cors = require("cors");

const databasePath = path.join(__dirname, "RoxilerDatabase.db");

const app = express();
app.use(cors());
app.use(express.json());

let database = null;

const initializeDbAndServer = async () => {
  try {
    database = await open({
      filename: databasePath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () =>
      console.log("Server Running at http://localhost:3000/")
    );
    createTable();
  } catch (error) {
    console.log(`DB Error:${error.message}`);
    process.exit(1);
  }
};
initializeDbAndServer();

const createTable = async () => {
  const createQuery = `
    CREATE TABLE  IF NOT EXISTS ProductData(
        id INTEGER ,
        title TEXT,
        price TEXT,
        description TEXT,
        category TEXT,
        image TEXT,
        sold BOOLEAN,
        dateOfSale 
    );`;

  await database.run(createQuery);
};

app.get("/initialize-database", async (request, response) => {
  const url = "https://s3.amazonaws.com/roxiler.com/product_transaction.json";
  const responseData = await axios.get(url);
  const transactionData = await responseData.data;
  for (const productData of transactionData) {
    const insertQuery = `INSERT INTO ProductData(id,title,price,description,category,image,sold,dateOfSale)
        VALUES(?,?,?,?,?,?,?,?);`;

    await database.run(insertQuery, [
      productData.id,
      productData.title,
      productData.price,
      productData.description,
      productData.category,
      productData.image,
      productData.sold,
      productData.dateOfSale,
    ]);
  }
  response.send({ message: "Data Initialized Successfully" });
});

app.get("/transactions", async (request, response) => {
  const {
    selectedMonth = "",
    searchText = "",
    limit = 10,
    offset = 0,
  } = request.query;
  const monthValue = format(new Date(selectedMonth), "MM");
  const getTodoQuery = `
     SELECT
      *
    FROM
      ProductData
    WHERE
      (title LIKE '%${searchText}%' OR description LIKE '%${searchText}%' OR price LIKE '%${searchText}%')
      AND dateOfSale LIKE '%-${monthValue}-%'
      LIMIT ${limit} OFFSET ${offset}
      `;

  const totalSearchedItems = `
     SELECT
      count(id) as total
    FROM
      ProductData
    WHERE
      (title LIKE '%${searchText}%' OR description LIKE '%${searchText}%' OR price LIKE '%${searchText}%')
      AND dateOfSale LIKE '%-${monthValue}-%' 
      `;
  const todoQuery = await database.all(getTodoQuery);
  const totalItems = await database.get(totalSearchedItems);
  res.json({ transactionsData: todoQuery, totalItems });
});

app.get("/statistics", async (request, response) => {
  const { selectedMonth = "" } = request.query;
  const monthValue = format(new Date(selectedMonth), "MM");

  const total_sale_amt = await database.all(`
    SELECT 
    SUM(price) AS total_sale_amt
    FROM ProductData 
    WHERE dateOfSale LIKE '%-${monthValue}-%' and sold = 1;`);

  const total_sold_items = await database.all(`
    SELECT COUNT()AS Total_sold_items
        FROM 
    ProductData 
        WHERE  
    dateOfSale LIKE '%-${monthValue}-%' 
        and 
    sold = 1;`);

  const total_unsold_items = await database.all(`
    SELECT 
    COUNT()AS Total_unSold_items
        FROM 
    ProductData
    WHERE dateOfSale LIKE '%-${monthValue}-%' and sold = 0;`);
  res.send({ total_sale_amt, total_sold_items, total_unsold_items });
});

app.get("/bar-chart", async (request, response) => {
  const { selectedMonth } = request.query;
  const monthValue = format(new Date(selectedMonth), "MM");
  const barChartData = [];

  const priceRange = [
    { min: 0, max: 100 },
    { min: 101, max: 200 },
    { min: 201, max: 300 },
    { min: 301, max: 400 },
    { min: 401, max: 500 },
    { min: 501, max: 600 },
    { min: 601, max: 700 },
    { min: 701, max: 800 },
    { min: 801, max: 900 },
    { min: 901, max: 10000 },
  ];

  for (let range of priceRange) {
    const total = await database.get(`SELECT 
            COUNT() AS count
        FROM 
        ProductData 
            WHERE 
        dateOfSale LIKE '%-${monthValue}-%' and price BETWEEN ${range.min} AND ${range.max};`);

    barChartData.push({
      priceRange: `${range.min}-${range.max}`,
      totalItems: total.count,
    });
  }

  res.send({ barChartData });
});

app.get("/pie-chart", async (request, response) => {
  const { selectedMonth } = request.query;
  const monthValue = format(new Date(selectedMonth), "MM");
  const pieChartData = await database.all(`
    SELECT 
    category,count(id) as items 
    FROM ProductData 
    WHERE dateOfSale LIKE '%-${monthValue}-%' 
    GROUP BY category;
  `);
  res.send({ pieChartData });
});

module.exports = app;
