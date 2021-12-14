import axios from "axios";

type Stock = {
  stockId: number;
  description: string;
};

type StockResponse = {
  stock: Stock[];
};

async function handler(): Promise<{ body: string; statusCode: number }> {
  console.log("create-order.handler - started");

  const result = await axios.get(
    `https://something.execute-api.eu-west-1.amazonaws.com/prod/stock`, // this is the private api dns entry
    {
      headers: {
        "x-api-key": "super-secret-api-key", // this is the api key for our private api
      },
    }
  );

  const data: StockResponse = result.data;

  console.log(`create-order.handler - private call is successful: ${data}`);

  return {
    body: JSON.stringify(data),
    statusCode: 200,
  };
}

module.exports = { handler };
