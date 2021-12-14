async function handler(): Promise<{ body: string; statusCode: number }> {
  console.log("get-stock.handler - started");

  return {
    body: JSON.stringify({
      stock: [
        {
          stockId: 1,
          description: "hammers",
        },
        {
          stockId: 2,
          description: "paint brushes",
        },
      ],
    }),
    statusCode: 200,
  };
}

module.exports = { handler };
