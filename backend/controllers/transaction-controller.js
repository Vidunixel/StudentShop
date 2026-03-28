const TransactionValidator = require("../validators/TransactionValidator");
const Transaction = require("../models/Transaction");

/************************************************************************************************
 * Controllers
 * **********************************************************************************************/

const getUserTransactions = async (req, res) => {
  let parsedParams;
  try {
    const uid = req?.user?.uid; // Extract the user's unique ID.
    parsedParams = TransactionValidator.parseGetUserTransactionsRequestParams(req.query);

    // Get id reference for the current state of the index if pitId is not already provided.
    if (!parsedParams.pitId) {
      parsedParams.pitId = await Transaction.getPointInTime();
    }

    const pageSize = 25;
    // Fetch existing transactions.
    let transactions = await Transaction.findManyByUserUidSearch(uid, parsedParams.sortBy, parsedParams.nextPage,
      parsedParams.pitId, pageSize, { detailedItem: true, withdrawal: true });
    const isLoadMoreEnabled = transactions.length === pageSize;

    // Filter transactions.
    transactions = transactions.map((transaction) => {
      return Transaction.filterAttributesForOwner(transaction);
    });

    // Send user cart.
    res.status(200).json({ pitId: parsedParams.pitId, transactions, isLoadMoreEnabled });
  } catch (error) {
    // Set statusCode based on error code.
    let statusCode;
    switch (error?.cause?.code) {
      default:
        console.error(error);
        statusCode = 500;
    }
    res.status(statusCode).json({ code: error?.cause?.code || "UNKNOWN" }); // Send error message.
  }
}

module.exports = { getUserTransactions }
